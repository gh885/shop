package com.shop.platform.order.service;

import static com.shop.platform.order.model.OrderStatus.PENDING_PAYMENT;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.github.f4b6a3.uuid.UuidCreator;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Validate;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockLine;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.PreviewOrderRequest;
import com.shop.platform.order.events.OrderPlacedEvent;
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
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 订单只读与下单：结算预览、按店拆单下单、买家/卖家两侧查询。
 *
 * <p>状态变更（取消/收货/发货/售后/超时）一律不在本类——归 {@link OrderTransitionService}，
 * 本类只做「下单 + 查询 + 装配」。事务与协作约定：下单在事务内同步调用 inventory :: api 的
 * StockCommand（同事务），库存不足则整单回滚；下单成功发布 OrderPlacedEvent，cart 同步监听清理已购 SKU
 * （order 不认识购物车：结算入参就是 SKU 行）。
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

    // ========== 结算预览 ==========

    /** 结算预览：只读。有效行按店铺分组算钱，失效/缺货行平铺置灰，地址可选回显 */
    @Transactional(readOnly = true)
    public CheckoutPreview preview(UUID userId, PreviewOrderRequest req) {
        // 1. 解析条目并判定可售性（跨模块只读点查，禁止 JOIN）
        ResolvedCheckout resolved = checkoutResolver.resolve(req.lines());

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
        ResolvedCheckout resolved = checkoutResolver.resolve(req.lines());
        Validate.isTrue(resolved.unavailable().isEmpty(), "部分商品已下架或库存不足，请重新确认结算");

        // 3. 按店铺拆单落库：主表 + 行项目两份快照；暂存订单与结算行的配对，冻结时直接用解析结果免重查
        Map<UUID, List<ValidLine>> byShop = resolved.valid().stream()
                .collect(Collectors.groupingBy(ValidLine::shopId, LinkedHashMap::new, Collectors.toList()));
        List<Map.Entry<Order, List<ValidLine>>> staged = new ArrayList<>();
        for (List<ValidLine> lines : byShop.values()) {
            staged.add(Map.entry(persistOrder(userId, req.buyerMessage(), address, lines), lines));
        }

        // 4. 库存与购物车清理：inventory 条件冻结（同事务同步调用，不足抛 409 回滚全部），cart 监听下单事件删已购 SKU
        for (Map.Entry<Order, List<ValidLine>> entry : staged) {
            stockCommand.freeze(entry.getKey().getId(), stockLinesOf(entry.getValue()));
        }
        events.publishEvent(new OrderPlacedEvent(
                userId, resolved.valid().stream().map(ValidLine::skuId).toList()));
        List<Order> created = staged.stream().map(Map.Entry::getKey).toList();
        log.info("[ORDER] 下单成功, userId={}, 单数={}, 总应付={}", userId, created.size(), resolved.totalPayAmount());
        return created;
    }

    // ========== 买家侧查询 ==========

    /** 我的订单分页：每单内嵌行项，列表页免 N+1 */
    @Transactional(readOnly = true)
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
    @Transactional(readOnly = true)
    public OrderWithItems detail(UUID userId, UUID orderId) {
        Order order = orderMapper.requireOwned(userId, orderId);
        return new OrderWithItems(order, orderItemMapper.selectByOrderId(order.getId()));
    }

    // ========== 卖家侧查询 ==========

    /** 卖家订单分页：ShopIdHolder 圈定本店 */
    @Transactional(readOnly = true)
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
    @Transactional(readOnly = true)
    public OrderWithItems sellerDetail(UUID shopId, UUID orderId) {
        Order order = orderMapper.requireShopOwned(shopId, orderId);
        return new OrderWithItems(order, orderItemMapper.selectByOrderId(order.getId()));
    }

    // ========== 内部：落单 ==========

    /** 落一笔订单：主表快照 + 行项目快照（单号生成见 {@link #insertOrder}） */
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

    /**
     * 落一笔订单：主键与业务单号在插入前定好，一次插入到位。
     *
     * <p>不做「撞号换号重试」：PG 一旦因唯一索引报错就把整个事务标记为 aborted，catch 之后的重插必然
     * 25P02 失败（pgjdbc 默认 autosave=never，不打 savepoint）——重试循环执行不到第二轮。改为让单号
     * 在构造上就不撞：uuidv7 主键自带 74 位随机段，取其低位派生 6 位十进制后缀，同毫秒内的区分度由它承担，
     * 不再依赖进程内序列（多实例各自计数，本来就会撞）。uk_orders_order_no 仍是最后防线。
     */
    private Order insertOrder(Order template) {
        UUID id = UuidCreator.getTimeOrderedEpoch();
        template.setId(id);
        // 业务单号 = 毫秒时间戳(17位) + 主键随机段派生(6位)，共 23 字符，order_no VARCHAR(32) 装得下
        template.setOrderNo(OffsetDateTime.now().format(ORDER_NO_FMT)
                + "%06d".formatted(Math.floorMod(id.getLeastSignificantBits(), 1_000_000)));
        orderMapper.insert(template);
        return template;
    }

    // ========== 内部：查询与装配辅助 ==========

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
}
