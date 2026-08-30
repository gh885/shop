package com.shop.platform.order.service;

import static com.shop.platform.order.model.OrderStatus.PENDING_PAYMENT;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.cart.events.CartCheckedOutEvent;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Validate;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockLine;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.PreviewOrderRequest;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.OrderItem;
import com.shop.platform.order.mapper.OrderItemMapper;
import com.shop.platform.order.mapper.OrderMapper;
import com.shop.platform.order.model.AfterSaleStatus;
import com.shop.platform.order.model.OrderAction;
import com.shop.platform.order.model.OrderActor;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.model.OrderTimeouts;
import com.shop.platform.order.service.CheckoutResolver.ResolvedCheckout;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 订单只读与下单：结算预览、按店拆单下单、买家/卖家两侧查询。
 *
 * <p>状态变更（取消/收货/发货/售后/超时）一律不在本类——归 {@link OrderTransitionService}，
 * 本类只做「下单 + 查询 + 装配」。事务与协作约定：下单在事务内同步调用 inventory :: api 的
 * StockCommand（同事务），库存不足则整单回滚；购物车清理是真通知，仍走事件总线（CartCheckedOutEvent）。
 *
 * <p>创建订单是「状态进入 PENDING_PAYMENT」的首动作，本类落单后记一条审计流水；此后一切状态变更
 * 的审计由 {@link OrderTransitionService} 负责，改变状态的口子全部留痕。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class OrderService {

    private final OrderMapper orderMapper;

    private final OrderItemMapper orderItemMapper;

    private final CheckoutResolver checkoutResolver;

    private final StockCommand stockCommand;

    private final OrderStatusLogWriter statusLogWriter;

    private final ApplicationEventPublisher events;

    private static final DateTimeFormatter ORDER_NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    private static final AtomicLong ORDER_NO_SEQ = new AtomicLong();

    // ========== 结算预览 ==========

    /** 结算预览：只读。有效行按店铺分组算钱，失效/缺货行平铺置灰，地址可选回显 */
    public CheckoutPreview preview(UUID userId, PreviewOrderRequest req) {
        // 1. 解析条目并判定可售性（跨模块只读点查，禁止 JOIN）
        ResolvedCheckout resolved =
                checkoutResolver.resolve(userId, req.cartItemIds(), req.buySkuId(), req.buyQuantity());

        // 2. 有效行按店铺分组算钱 —— 分组即拆单预告
        List<CheckoutPreview.Group> groups = checkoutResolver.groupByShop(resolved.valid());
        Money totalPayAmount =
                groups.stream().map(CheckoutPreview.Group::payAmount).reduce(Money.cny(0), Money::plus);

        // 3. 地址回显：传了就校验归属并镜像，没传返回 null（前端持有地址列表自行默认勾选）
        CheckoutPreview.Address address = req.addressId() != null
                ? new CheckoutPreview.Address(
                        req.addressId(), checkoutResolver.loadAddressSnapshot(userId, req.addressId()))
                : null;

        return new CheckoutPreview(groups, resolved.unavailable(), address, totalPayAmount);
    }

    // ========== 创建订单 ==========

    /**
     * 创建订单：一次结算按店铺拆成 N 单，全成全败。
     * 库存最终闸门在 product :: api 的同步条件扣减里（失败 → 本事务整体回滚）。
     */
    @Transactional
    public List<Order> create(UUID userId, CreateOrderRequest req) {
        // 1. 校验收货地址归属并取快照（下单定格，之后改/删地址不影响本单）
        AddressSnapshot address = checkoutResolver.loadAddressSnapshot(userId, req.addressId());

        // 2. 全量有效才允许下单：任一行失效或缺货直接拒绝（预览页已提示过，这里兜底并发变化）
        ResolvedCheckout resolved =
                checkoutResolver.resolve(userId, req.cartItemIds(), req.buySkuId(), req.buyQuantity());
        Validate.isTrue(resolved.unavailable().isEmpty(), "部分商品已下架或库存不足，请重新确认结算");

        // 3. 按店铺拆单落库：主表 + 行项目两份快照；暂存订单与结算行的配对，冻结时直接用解析结果免重查
        Map<UUID, List<ValidLine>> byShop = resolved.valid().stream()
                .collect(Collectors.groupingBy(ValidLine::shopId, LinkedHashMap::new, Collectors.toList()));
        List<Map.Entry<Order, List<ValidLine>>> staged = new ArrayList<>();
        for (List<ValidLine> lines : byShop.values()) {
            staged.add(Map.entry(persistOrder(userId, req.buyerMessage(), address, lines), lines));
        }

        // 4. 库存与购物车清理：inventory 条件冻结（同事务同步调用，不足抛 409 回滚全部），cart 删除已购条目（事件通知）
        for (Map.Entry<Order, List<ValidLine>> entry : staged) {
            stockCommand.freeze(entry.getKey().getId(), stockLinesOf(entry.getValue()));
        }
        List<UUID> cartItemIds = distinct(req.cartItemIds());
        if (!cartItemIds.isEmpty()) {
            events.publishEvent(new CartCheckedOutEvent(userId, cartItemIds));
        }
        List<Order> created = staged.stream().map(Map.Entry::getKey).toList();
        log.info("[ORDER] 下单成功, userId={}, 单数={}, 总应付={}", userId, created.size(), resolved.totalPayAmount());
        return created;
    }

    // ========== 买家侧查询 ==========

    /** 我的订单分页：每单内嵌行项，列表页免 N+1 */
    public PageResult<OrderWithItems> pageMine(UUID userId, String status, PageParams page) {
        OrderStatus filter = parseStatusFilter(status);
        Page<Order> rows = orderMapper.selectPage(
                new Page<>(page.page(), page.size()),
                new LambdaQueryWrapper<Order>()
                        .eq(Order::getUserId, userId)
                        .eq(filter != null, Order::getStatus, filter)
                        .orderByDesc(Order::getCreatedAt));
        return new PageResult<>(attachItems(rows.getRecords()), rows.getTotal());
    }

    /** 订单详情：非本人一律 404，不泄露单据存在性 */
    public OrderWithItems detail(UUID userId, UUID orderId) {
        Order order = requireOwned(userId, orderId);
        return new OrderWithItems(order, orderItemMapper.selectByOrderId(order.getId()));
    }

    // ========== 卖家侧查询 ==========

    /** 卖家订单分页：ShopIdHolder 圈定本店 */
    public PageResult<OrderWithItems> pageSeller(UUID shopId, String status, PageParams page) {
        OrderStatus filter = parseStatusFilter(status);
        Page<Order> rows = orderMapper.selectPage(
                new Page<>(page.page(), page.size()),
                new LambdaQueryWrapper<Order>()
                        .eq(Order::getShopId, shopId)
                        .eq(filter != null, Order::getStatus, filter)
                        .orderByDesc(Order::getCreatedAt));
        return new PageResult<>(attachItems(rows.getRecords()), rows.getTotal());
    }

    /** 卖家订单详情：非本店一律 404 */
    public OrderWithItems sellerDetail(UUID shopId, UUID orderId) {
        Order order = Validate.notNull(orderMapper.selectById(orderId), "订单不存在");
        Validate.isTrue(order.getShopId().equals(shopId), "订单不存在");
        return new OrderWithItems(order, orderItemMapper.selectByOrderId(order.getId()));
    }

    // ========== 内部：落单 ==========

    /** 落一笔订单：主表快照 + 行项目快照；orderNo 极小概率撞号时换号重插 */
    private Order persistOrder(UUID userId, String buyerMessage, AddressSnapshot addr, List<ValidLine> lines) {
        Money itemAmount = checkoutResolver.sumLines(lines);
        Order template = Order.builder()
                .userId(userId)
                .shopId(lines.getFirst().shopId())
                .status(PENDING_PAYMENT)
                .itemAmount(itemAmount.amount())
                .shippingFee(0L) // V1 未接计费恒 0；上运费后 payAmount = itemAmount + shippingFee
                .payAmount(itemAmount.amount())
                .currency(itemAmount.currency())
                // 快照整块展开成六列平铺（MyBatis-Plus 无嵌入映射）
                .receiverName(addr.receiverName())
                .receiverPhone(addr.receiverPhone())
                .receiverProvince(addr.province())
                .receiverCity(addr.city())
                .receiverDistrict(addr.district())
                .receiverDetail(addr.detail())
                .buyerMessage(buyerMessage == null || buyerMessage.isBlank() ? null : buyerMessage.trim())
                .payExpireAt(OffsetDateTime.now().plus(OrderTimeouts.PAY))
                .afterSaleStatus(AfterSaleStatus.NONE)
                .build();

        Order order = insertOrder(template);
        // 首动作审计：订单落库即进入 PENDING_PAYMENT（无前态），此后状态变更由 OrderTransitionService 留痕
        statusLogWriter.record(order.getId(), null, PENDING_PAYMENT, OrderAction.CREATE, OrderActor.BUYER, null);
        for (ValidLine line : lines) {
            Money lineAmount = line.price().times(line.quantity());
            orderItemMapper.insert(OrderItem.builder()
                    .orderId(order.getId())
                    .productId(line.productId())
                    .skuId(line.skuId())
                    .name(line.name())
                    .image(line.image())
                    .price(line.price().amount())
                    .originalPrice(
                            line.originalPrice() != null ? line.originalPrice().amount() : null)
                    .currency(line.price().currency())
                    .quantity(line.quantity())
                    .amount(lineAmount.amount())
                    .build());
        }
        return order;
    }

    private Order insertOrder(Order template) {
        // 业务单号 = 时间戳(17位) + 进程内序列(3位)；uk_orders_order_no 是最后防线，撞号换号重试
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                orderMapper.insert(withNextOrderNo(template));
                return template;
            } catch (DuplicateKeyException ignored) {
                // 撞号重试
            }
        }
        throw new BusinessException(500, "订单号生成冲突，请重试");
    }

    private Order withNextOrderNo(Order template) {
        long seq = ORDER_NO_SEQ.updateAndGet(v -> (v + 1) % 1000);
        template.setOrderNo(OffsetDateTime.now().format(ORDER_NO_FMT) + "%03d".formatted(seq));
        return template;
    }

    // ========== 内部：查询与装配辅助 ==========

    private Order requireOwned(UUID userId, UUID orderId) {
        Order order = Validate.notNull(orderMapper.selectById(orderId), "订单不存在");
        Validate.isTrue(order.getUserId().equals(userId), "订单不存在");
        return order;
    }

    /** 列表筛选状态：空 = 全部；非法值给 400（枚举自己就是合法值表，不另维护一份） */
    private static OrderStatus parseStatusFilter(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        try {
            return OrderStatus.valueOf(status);
        } catch (IllegalArgumentException e) {
            throw BusinessException.badRequest("非法的订单状态筛选值");
        }
    }

    private List<OrderWithItems> attachItems(List<Order> orders) {
        if (orders.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<OrderItem>> grouped =
                orderItemMapper
                        .selectByOrderIds(orders.stream().map(Order::getId).toList())
                        .stream()
                        .collect(Collectors.groupingBy(OrderItem::getOrderId));
        return orders.stream()
                .map(o -> new OrderWithItems(o, grouped.getOrDefault(o.getId(), List.of())))
                .toList();
    }

    /** 结算有效行 → 库存结算行：下单冻结直接吃解析结果，免重查刚落库的行项目 */
    private static List<StockLine> stockLinesOf(List<ValidLine> lines) {
        return lines.stream().map(l -> new StockLine(l.skuId(), l.quantity())).toList();
    }

    private static List<UUID> distinct(List<UUID> ids) {
        return ids == null ? List.of() : new ArrayList<>(new LinkedHashSet<>(ids));
    }
}
