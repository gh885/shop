package com.shop.platform.order.service;

import static com.shop.platform.order.mapper.Order.STATUS_CANCELLED;
import static com.shop.platform.order.mapper.Order.STATUS_COMPLETED;
import static com.shop.platform.order.mapper.Order.STATUS_PENDING_PAYMENT;
import static com.shop.platform.order.mapper.Order.STATUS_SHIPPED;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
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
import com.shop.platform.order.dto.ShipOrderRequest;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.OrderItem;
import com.shop.platform.order.mapper.OrderItemMapper;
import com.shop.platform.order.mapper.OrderMapper;
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
 * 订单业务：结算预览、按店拆单、状态机流转。
 *
 * <p>事务与协作约定：下单/取消在事务内同步调用 product :: api 的 StockCommand（同事务）——
 * 库存不足则整单回滚，订单取消与库存回补原子生效；购物车清理是真通知，仍走事件总线
 * （CartCheckedOutEvent）。金额一律以 DB 投影计算，前端传入的只作展示。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class OrderService {

    /** 待付款超时分钟数，超时由定时任务关单回补库存 */
    private static final int PAY_EXPIRE_MINUTES = 15;

    private final OrderMapper orderMapper;

    private final OrderItemMapper orderItemMapper;

    private final CheckoutResolver checkoutResolver;

    private final StockCommand stockCommand;

    private final OrderCloseService orderCloseService;

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
        validateStatus(status);
        Page<Order> rows = orderMapper.selectPage(
                new Page<>(page.page(), page.size()),
                new LambdaQueryWrapper<Order>()
                        .eq(Order::getUserId, userId)
                        .eq(status != null && !status.isBlank(), Order::getStatus, status)
                        .orderByDesc(Order::getCreatedAt));
        return new PageResult<>(attachItems(rows.getRecords()), rows.getTotal());
    }

    /** 订单详情：非本人一律 404，不泄露单据存在性 */
    public OrderWithItems detail(UUID userId, UUID orderId) {
        Order order = requireOwned(userId, orderId);
        return new OrderWithItems(order, orderItemMapper.selectByOrderId(order.getId()));
    }

    // ========== 状态机：买家操作 ==========

    /** 买家取消：仅待付款/待发货可取消（源状态由状态机反推），库存回补按 RETURNING OLD 带回的真实前态分流 */
    @Transactional
    public void cancel(UUID userId, UUID orderId, String reason) {
        // 1. 归属校验
        requireOwned(userId, orderId);

        // 2. 取出行项供库存回退
        List<OrderItem> items = orderItemMapper.selectByOrderId(orderId);

        // 3. 条件转移并取回转移前状态：抢不到说明已被支付/发货/关闭，让前端刷新重试
        String previousStatus = orderMapper.cancelReturningPrevious(
                orderId,
                Order.sourcesOf(STATUS_CANCELLED),
                OffsetDateTime.now(),
                reason == null || reason.isBlank() ? null : reason.trim());
        Validate.isTrue(previousStatus != null, 409, "订单状态已变更，当前不可取消");

        // 4. 库存回退按真实前态分流：付款后取消回补总库存（已扣实 → stock 增），付款前取消释放冻结（frozen→可用）
        if (Order.STATUS_PAID.equals(previousStatus)) {
            stockCommand.restock(orderId, toStockLines(items));
        } else {
            stockCommand.release(orderId, toStockLines(items));
        }
        log.info("[ORDER] 买家取消订单, orderId={}, userId={}", orderId, userId);
    }

    /** 确认收货：已发货 → 已完成 */
    @Transactional
    public void receive(UUID userId, UUID orderId) {
        requireOwned(userId, orderId);
        int affected = orderMapper.update(
                null,
                condition(orderId)
                        .in(Order::getStatus, Order.sourcesOf(STATUS_COMPLETED))
                        .set(Order::getStatus, STATUS_COMPLETED)
                        .set(Order::getCompletedAt, OffsetDateTime.now()));
        Validate.isTrue(affected == 1, 409, "订单状态已变更，当前不可确认收货");
    }

    // ========== 状态机：卖家操作 ==========

    /** 发货：待发货 → 已发货，回填物流信息（一单一包裹） */
    @Transactional
    public void ship(UUID shopId, UUID orderId, ShipOrderRequest req) {
        // 1. 条件转移：限定本店 + 状态机反推的源状态，越店与错态都在影响行数上暴露
        int affected = orderMapper.update(
                null,
                condition(orderId)
                        .eq(Order::getShopId, shopId)
                        .in(Order::getStatus, Order.sourcesOf(STATUS_SHIPPED))
                        .set(Order::getStatus, STATUS_SHIPPED)
                        .set(Order::getShippedAt, OffsetDateTime.now())
                        .set(Order::getLogisticsCompany, req.logisticsCompany())
                        .set(Order::getTrackingNo, req.trackingNo()));
        if (affected > 0) {
            return;
        }

        // 2. 失败细分原因：不存在/非本店给 404，状态不对给 409
        Order existing = orderMapper.selectById(orderId);
        if (existing == null || !existing.getShopId().equals(shopId)) {
            throw BusinessException.notFound("订单不存在");
        }
        throw new BusinessException(409, "订单不是待发货状态");
    }

    /** 卖家订单分页：ShopIdHolder 圈定本店 */
    public PageResult<OrderWithItems> pageSeller(UUID shopId, String status, PageParams page) {
        validateStatus(status);
        Page<Order> rows = orderMapper.selectPage(
                new Page<>(page.page(), page.size()),
                new LambdaQueryWrapper<Order>()
                        .eq(Order::getShopId, shopId)
                        .eq(status != null && !status.isBlank(), Order::getStatus, status)
                        .orderByDesc(Order::getCreatedAt));
        return new PageResult<>(attachItems(rows.getRecords()), rows.getTotal());
    }

    /** 卖家订单详情：非本店一律 404 */
    public OrderWithItems sellerDetail(UUID shopId, UUID orderId) {
        Order order = Validate.notNull(orderMapper.selectById(orderId), "订单不存在");
        Validate.isTrue(order.getShopId().equals(shopId), "订单不存在");
        return new OrderWithItems(order, orderItemMapper.selectByOrderId(order.getId()));
    }

    // ========== 状态机：系统 ==========

    /**
     * 超时关单批量入口：扫描过期待付款单（非事务），逐笔委托 OrderCloseService 关单回补——
     * 每笔独立事务，批量入口与单笔方法分属两个 bean，规避自调用导致 @Transactional 失效。
     */
    public int closeExpired() {
        List<Order> expired = orderMapper.selectList(new LambdaQueryWrapper<Order>()
                .eq(Order::getStatus, STATUS_PENDING_PAYMENT)
                .lt(Order::getPayExpireAt, OffsetDateTime.now())
                .orderByAsc(Order::getPayExpireAt)
                .last("LIMIT " + OrderCloseService.CLOSE_BATCH_LIMIT));
        int closed = 0;
        for (Order order : expired) {
            if (orderCloseService.closeOne(order)) {
                closed++;
            }
        }
        return closed;
    }

    // ========== 内部：落单 ==========

    /** 落一笔订单：主表快照 + 行项目快照；orderNo 极小概率撞号时换号重插 */
    private Order persistOrder(UUID userId, String buyerMessage, AddressSnapshot addr, List<ValidLine> lines) {
        Money itemAmount = checkoutResolver.sumLines(lines);
        Order template = Order.builder()
                .userId(userId)
                .shopId(lines.getFirst().shopId())
                .status(STATUS_PENDING_PAYMENT)
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
                .payExpireAt(OffsetDateTime.now().plusMinutes(PAY_EXPIRE_MINUTES))
                .build();

        Order order = insertOrder(template);
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

    private void validateStatus(String status) {
        Validate.isTrue(status == null || status.isBlank() || Order.ALL_STATUSES.contains(status), "非法的订单状态筛选值");
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

    /** 更新起点：主键定位 + 影响行数即乐观闸门 */
    private static LambdaUpdateWrapper<Order> condition(UUID orderId) {
        return new LambdaUpdateWrapper<Order>().eq(Order::getId, orderId);
    }

    static List<StockLine> toStockLines(List<OrderItem> items) {
        return items.stream()
                .map(i -> new StockLine(i.getSkuId(), i.getQuantity()))
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
