package com.shop.platform.order.service;

import com.github.f4b6a3.uuid.UuidCreator;
import com.shop.platform.account.api.UserReadQuery;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.Money;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Text;
import com.shop.platform.common.Validate;
import com.shop.platform.coupon.api.CouponCommand;
import com.shop.platform.infra.observability.BizEvent;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockLine;
import com.shop.platform.order.api.AfterSaleBadge;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.PreviewOrderRequest;
import com.shop.platform.order.events.OrderPlacedEvent;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.OrderItem;
import com.shop.platform.order.mapper.OrderItemMapper;
import com.shop.platform.order.mapper.OrderMapper;
import com.shop.platform.order.mapper.Trade;
import com.shop.platform.order.mapper.TradeMapper;
import com.shop.platform.order.model.MainProgress;
import com.shop.platform.order.model.OrderAction;
import com.shop.platform.order.model.OrderActor;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.model.OrderTimeouts;
import com.shop.platform.order.model.TradeStatus;
import com.shop.platform.order.service.CheckoutResolver.ResolvedCheckout;
import com.shop.platform.shop.api.ShopReadQuery;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 订单只读与下单：结算预览、创建主订单 + 按店拆子订单、买卖两侧查询。
 *
 * <p>根决策（docs/domain/order-model.md §2）：一次结算 = 一次支付 = 一张主订单；
 * 支付覆盖多个卖家时按卖家拆子订单。子订单创建即处于待发货（{@code PAID}），{@code paid_at} 为空——
 * 「还没付钱」由主订单状态表达，子订单没有待付款态。
 *
 * <p>状态变更（取消/收货/发货/售后/超时）一律不在本类——归 {@link OrderTransitionService}，
 * 本类只做「下单 + 查询 + 装配」。事务与协作约定：下单在事务内同步调用 inventory :: api 的
 * StockCommand（同事务），库存不足则整单回滚；下单成功发布 OrderPlacedEvent，cart 同步监听清理已购 SKU。
 */
@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderMapper orderMapper;

    private final OrderItemMapper orderItemMapper;

    private final TradeMapper tradeMapper;

    private final CheckoutResolver checkoutResolver;

    /** 账号闸门（account :: api）：下单先验买家状态，禁用/注销账号不进交易 */
    private final UserReadQuery userReadQuery;

    /** 营业闸门（shop :: api）：下单的每一家店都须 ACTIVE，停业的店不进交易 */
    private final ShopReadQuery shopReadQuery;

    private final StockCommand stockCommand;

    /** 券命令（coupon :: api）：下单占用在同事务内完成，抢不到回滚整笔下单 */
    private final CouponCommand couponCommand;

    private final OrderStatusLogWriter statusLogWriter;

    private final ApplicationEventPublisher events;

    private static final DateTimeFormatter NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    /** 一次结算的产物：主订单 + 其下子订单（同事务落下） */
    public record CreatedTrade(Trade trade, List<Order> orders) {}

    // 结算预览
    /** 结算预览：只读。有效行按店铺分组算钱（含运费），失效/缺货行平铺置灰，地址可选回显 */
    @Transactional(readOnly = true)
    public CheckoutPreview preview(UUID userId, PreviewOrderRequest req) {
        // 1. 解析条目并判定可售性（跨模块只读点查，禁止 JOIN）
        ResolvedCheckout resolved = checkoutResolver.resolve(req.lines());

        // 2. 地址回显：传了就校验归属并镜像，没传返回 null（前端持有地址列表自行默认勾选）
        CheckoutPreview.Address address = req.addressId() != null
                ? new CheckoutPreview.Address(
                        req.addressId(), checkoutResolver.loadAddressSnapshot(userId, req.addressId()))
                : null;

        // 3. 有效行按店铺分组算钱 —— 分组即拆单预告，运费与券都在此定格，与下单走同一条计费路径
        List<CheckoutPreview.Group> groups = checkoutResolver.groupByShop(
                resolved.valid(), address == null ? null : address.snapshot(), userId, req.userCouponIds());
        Money totalPayAmount =
                groups.stream().map(CheckoutPreview.Group::payAmount).reduce(Money.cny(0), Money::plus);

        return new CheckoutPreview(groups, resolved.unavailable(), address, totalPayAmount);
    }

    // 创建订单
    /**
     * 创建订单：一次结算落一张主订单 + 按店铺拆 N 张子订单，全成全败。
     * 入口先过账号闸门（禁用账号 403 USER_DISABLED），再过恶拍闸门（在途待支付主订单与拍下不付各自封顶，429），
     * 再过营业闸门（本店非 ACTIVE 一律 409「店铺已停止营业」）。
     * 库存最终闸门在 inventory :: api 的同步条件扣减里（失败 → 本事务整体回滚）。
     *
     * <p>幂等由 uk_trades_user_checkout 唯一索引承担：同一 checkoutKey 的重复提交在第一张主订单 insert 就撞键，
     * 库存冻结执行不到第二次。撞键后的重放（回读原单）在 {@link OrderPlacementService}——PG 撞唯一索引即中止整个事务，
     * 只能在事务外接住。
     */
    @Transactional
    public CreatedTrade create(UUID userId, CreateOrderRequest req) {
        // 1. 账号闸门：买家状态非 ACTIVE 一律 403 拒单
        if (!userReadQuery.isActive(userId)) {
            throw BusinessException.forbidden(ErrorCodes.USER_DISABLED, "账号已被禁用");
        }

        // 2. 恶拍闸门：拍下即冻结库存，先挡脚本再解析地址与结算行
        assertNotMaliciousBidder(userId);

        // 3. 校验收货地址归属并取快照（下单定格，之后改/删地址不影响本单）
        AddressSnapshot address = checkoutResolver.loadAddressSnapshot(userId, req.addressId());

        // 4. 全量有效才允许下单：任一行失效或缺货直接拒绝（预览页已提示过，这里兜底并发变化）
        ResolvedCheckout resolved = checkoutResolver.resolve(req.lines());
        Validate.isTrue(resolved.unavailable().isEmpty(), "部分商品已下架或库存不足，请重新确认结算");

        // 5. 营业闸门：本单涉及的每一家店都须 ACTIVE
        for (UUID shopId :
                resolved.valid().stream().map(ValidLine::shopId).distinct().toList()) {
            if (!shopReadQuery.isActive(shopId)) {
                throw BusinessException.conflict(null, "店铺已停止营业");
            }
        }

        // 6. 按店铺分组算钱：分组顺序（shopId 升序）即拆单与冻结锁序
        List<CheckoutPreview.Group> groups =
                checkoutResolver.groupByShop(resolved.valid(), address, userId, req.userCouponIds());
        Validate.isTrue(!groups.isEmpty(), "结算条目不能为空");
        Validate.isTrue(groups.stream().allMatch(CheckoutPreview.Group::deliverable), "部分商品不支持配送到所选地区，请更换收货地址");

        // 7. 主订单先落：金额 = Σ 子订单；地址/幂等键/支付时限只在这里存一份
        Trade trade = insertTrade(userId, req, address, groups);

        // 8. 子订单 + 行项目 + 分摊：逐店落库，金额与计费/用券快照直接吃分组结果，不重算
        List<Order> created = new ArrayList<>(groups.size());
        for (CheckoutPreview.Group group : groups) {
            created.add(persistOrder(trade, userId, group));
        }

        // 9. 库存与券：inventory 条件冻结（同事务，不足抛 409 回滚全部），coupon 占用
        for (int i = 0; i < groups.size(); i++) {
            Order order = created.get(i);
            CheckoutPreview.Group group = groups.get(i);
            stockCommand.freeze(order.getId(), stockLinesOf(group.lines()));
            if (group.appliedCoupon() != null) {
                couponCommand.lock(
                        group.appliedCoupon().userCouponId(),
                        userId,
                        group.shopId(),
                        order.getId(),
                        group.appliedCoupon().discount());
            }
        }

        events.publishEvent(new OrderPlacedEvent(
                userId, resolved.valid().stream().map(ValidLine::skuId).toList()));

        // 10. 业务事件：一条事实一行，主订单打一张（金额整体入字段），子订单各一张
        BizEvent.of("trade.created")
                .put("trade_id", trade.getId())
                .put("user_id", userId)
                .put("pay_amount", trade.payAmountAsMoney())
                .put("shop_count", created.size())
                .emit();
        for (Order order : created) {
            BizEvent.of("order.created")
                    .put("order_id", order.getId())
                    .put("trade_id", trade.getId())
                    .put("user_id", order.getUserId())
                    .put("shop_id", order.getShopId())
                    .put("pay_amount", order.payAmountAsMoney())
                    .emit();
        }
        return new CreatedTrade(trade, created);
    }

    // 恶拍闸门
    /** 在途待支付主订单上限：一次多店结算只算一张，阈值按「次」计 */
    private static final int MAX_PENDING_PAYMENT_TRADES = 10;

    /** 窗口内「拍下不付即关闭」的主订单数上限 */
    private static final int MAX_UNPAID_CANCELLED_TRADES = 10;

    /** 拍下不付的统计窗口 */
    private static final Duration UNPAID_CANCEL_WINDOW = Duration.ofHours(24);

    /**
     * 恶意拍下的两道计数闸：在途待支付太多 = 锁着不放；24 小时内拍下不付太多 = 反复锁了又退。
     * 计数前先取本人的咨询锁，把同一个买家的结算串成一条线。
     */
    private void assertNotMaliciousBidder(UUID userId) {
        // 1. 用户级串行闸：只串本人的结算，别的买家不受影响；事务结束自动释放
        tradeMapper.lockCheckoutGate(userId);
        // 2. 两道计数闸：锁已持有，读数与 insert 之间不会被同一买家的另一次结算改掉
        if (tradeMapper.countPendingPayment(userId) >= MAX_PENDING_PAYMENT_TRADES) {
            throw BusinessException.rateLimited("待付款订单过多，请先完成支付或取消部分订单");
        }
        if (tradeMapper.countUnpaidClosedSince(userId, OffsetDateTime.now().minus(UNPAID_CANCEL_WINDOW))
                >= MAX_UNPAID_CANCELLED_TRADES) {
            throw BusinessException.rateLimited("近期取消的未付款订单过多，请稍后再试");
        }
    }

    // 买家侧查询
    /**
     * 我的订单分页：以<b>主订单</b>为单位（一次结算 = 一张卡），每张卡内嵌它拆出的子订单与行项，
     * 列表页免 N+1；店名一次 IN 批查。
     *
     * <p>页签筛的是主进度投影（§5.3）：支付生死在主订单、货走到哪在子订单，买家眼里只有一条线，
     * 按子订单分页会把同一次结算拆成好几行，也会让「一单完成一单待发货」这类状态无处安放。
     */
    @Transactional(readOnly = true)
    public PageResult<TradeListItemView> pageMyTrades(UUID userId, String progress, PageParams page) {
        var rows = tradeMapper.selectPageByBuyer(
                page, userId, Validate.enumFilter(MainProgress.class, progress, "非法的订单进度筛选值"));
        return new PageResult<>(assembleTrades(rows.getRecords()), rows.getTotal());
    }

    /** 主订单详情：收银台与「这一笔买了什么」用同一形状；非本人一律 404 */
    @Transactional(readOnly = true)
    public TradeListItemView tradeDetail(UUID userId, UUID tradeId) {
        return assembleTrades(List.of(tradeMapper.requireOwned(userId, tradeId)))
                .getFirst();
    }

    /** 订单详情：非本人一律 404；店名同口径单点补入 */
    @Transactional(readOnly = true)
    public OrderDetailView detail(UUID userId, UUID orderId) {
        OrderWithItems detail = withItems(orderMapper.requireOwned(userId, orderId));
        UUID shopId = detail.order().getShopId();
        String shopName = shopReadQuery.namesByIds(List.of(shopId)).get(shopId);
        return OrderDetailView.buyerView(detail, shopName);
    }

    // 卖家侧查询
    /** 卖家订单分页：shopId 入参圈定本店 */
    @Transactional(readOnly = true)
    public PageResult<OrderWithItems> pageSeller(UUID shopId, String status, PageParams page) {
        var rows = orderMapper.selectPageByShop(page, shopId, filterStatus(status));
        return new PageResult<>(attachItems(rows.getRecords()), rows.getTotal());
    }

    /** 卖家订单详情：非本店一律 404 */
    @Transactional(readOnly = true)
    public OrderWithItems sellerDetail(UUID shopId, UUID orderId) {
        return withItems(orderMapper.requireShopOwned(shopId, orderId));
    }

    /**
     * 卖家取收件人明文电话：卖家侧所有列表与详情出参都是掩码（ORD-62），明文只有这一个逐单出口，
     * 每次取用打一条业务事件留痕。非本店 404。收件人快照在主订单上。
     */
    @Transactional(readOnly = true)
    public String sellerReceiverPhone(UUID shopId, UUID orderId, UUID operatorId) {
        Order order = orderMapper.requireShopOwned(shopId, orderId);
        BizEvent.of("order.receiver_phone_revealed")
                .put("shop_id", shopId)
                .put("order_id", orderId)
                .put("operator_id", operatorId)
                .emit();
        return tradeMapper.selectById(order.getTradeId()).getReceiverPhone();
    }

    /**
     * 平台营业时区：看板按「卖家本地日历日」切档。
     */
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");

    /** 看板窗口：近 30 个营业日（含今天） */
    private static final int DAILY_SALES_WINDOW_DAYS = 30;

    /**
     * 卖家看板·近 30 天每日销售额：把 mapper 的「营业日 → Σ 实付（Money）」补成连续 30 天（缺成交的日补零）。
     */
    @Transactional(readOnly = true)
    public List<DailySalesView> sellerDailySales(UUID shopId) {
        LocalDate from = LocalDate.now(BUSINESS_ZONE).minusDays(DAILY_SALES_WINDOW_DAYS - 1L);
        OffsetDateTime since = from.atStartOfDay(BUSINESS_ZONE).toOffsetDateTime();
        Map<LocalDate, Money> realizedByDay = orderMapper.sumPayAmountByDay(shopId, since);

        List<DailySalesView> series = new ArrayList<>(DAILY_SALES_WINDOW_DAYS);
        for (int i = 0; i < DAILY_SALES_WINDOW_DAYS; i++) {
            LocalDate date = from.plusDays(i);
            series.add(new DailySalesView(date, realizedByDay.getOrDefault(date, Money.zero(Money.CNY))));
        }
        return series;
    }

    // 内部：落单
    /** 落主订单：金额 = Σ 子订单，地址/幂等键/支付时限只存这一份 */
    private Trade insertTrade(
            UUID userId, CreateOrderRequest req, AddressSnapshot addr, List<CheckoutPreview.Group> groups) {
        Money itemAmount = sum(groups, CheckoutPreview.Group::itemAmount);
        Money shippingFee = sum(groups, CheckoutPreview.Group::shippingFee);
        Money discountAmount = sum(groups, CheckoutPreview.Group::discountAmount);
        Money payAmount = sum(groups, CheckoutPreview.Group::payAmount);
        UUID id = UuidCreator.getTimeOrderedEpoch();
        Trade trade = Trade.builder()
                .id(id)
                .tradeNo(generateNo("T", id))
                .userId(userId)
                .status(TradeStatus.PENDING_PAYMENT)
                .itemAmount(itemAmount.amount())
                .shippingFee(shippingFee.amount())
                .discountAmount(discountAmount.amount())
                .payAmount(payAmount.amount())
                .paidAmount(0L)
                .refundedAmount(0L)
                .compensatedAmount(0L)
                .currency(itemAmount.currency())
                .receiverName(addr.receiverName())
                .receiverPhone(addr.receiverPhone())
                .receiverRegionCode(addr.regionCode())
                .receiverProvince(addr.province())
                .receiverCity(addr.city())
                .receiverDistrict(addr.district())
                .receiverDetail(addr.detail())
                .buyerMessage(Text.trimToNull(req.buyerMessage()))
                .payExpireAt(OffsetDateTime.now().plus(OrderTimeouts.PAY))
                .checkoutKey(req.checkoutKey())
                .build();
        tradeMapper.insert(trade);
        return trade;
    }

    /**
     * 落一张子订单：金额与计费/用券快照直接吃分组结果；行项目同时算好分摊三列与账本计数列。
     * 子订单创建即待发货（PAID），paid_at 为空——发货闸门读它，未支付不可能发货。
     */
    private Order persistOrder(Trade trade, UUID userId, CheckoutPreview.Group group) {
        Order order = Order.builder()
                .tradeId(trade.getId())
                .userId(userId)
                .shopId(group.shopId())
                .status(OrderStatus.PAID)
                .itemAmount(group.itemAmount().amount())
                .shippingFee(group.shippingFee().amount())
                .discountAmount(group.discountAmount().amount())
                .payAmount(group.payAmount().amount())
                .currency(group.itemAmount().currency())
                .userCouponId(
                        group.appliedCoupon() == null
                                ? null
                                : group.appliedCoupon().userCouponId())
                .couponBearer(
                        group.appliedCoupon() == null
                                ? null
                                : group.appliedCoupon().bearer())
                .shippingTemplateId(group.shippingTemplateId())
                .afterSaleBadge(AfterSaleBadge.NONE)
                .build();

        UUID orderId = UuidCreator.getTimeOrderedEpoch();
        order.setId(orderId);
        order.setOrderNo(generateNo("", orderId));
        orderMapper.insert(order);

        // 首动作审计：子订单落库即待发货（无前态），此后状态变更由 OrderTransitionService 留痕
        statusLogWriter.record(order.getId(), null, OrderStatus.PAID, OrderAction.CREATE, OrderActor.BUYER, null);
        insertItems(order, group);
        return order;
    }

    /** 行项目快照 + 分摊：折扣与运费都按行金额占比摊到每一行，等式由 DB CHECK 兜底 */
    private void insertItems(Order order, CheckoutPreview.Group group) {
        List<Long> amounts = group.lines().stream()
                .map(line -> line.price().times(line.quantity()).amount())
                .toList();
        long[] discounts;
        long[] shipping;
        try {
            discounts =
                    DiscountAllocator.allocateDiscount(group.discountAmount().amount(), amounts);
            shipping = DiscountAllocator.allocateShipping(group.shippingFee().amount(), amounts);
        } catch (IllegalArgumentException e) {
            throw BusinessException.badRequest(e.getMessage());
        }
        for (int i = 0; i < group.lines().size(); i++) {
            ValidLine line = group.lines().get(i);
            long amount = amounts.get(i);
            long goodsPaid = amount - discounts[i];
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
                    .amount(amount)
                    .discountAllocated(discounts[i])
                    .shippingAllocated(shipping[i])
                    .goodsPaidAmount(goodsPaid)
                    .refundableAmount(goodsPaid + shipping[i])
                    .shippedQuantity(0)
                    .refundedQuantity(0)
                    .settledQuantity(0)
                    .refundedAmount(0L)
                    .sevenDayReturn(line.sevenDayReturn())
                    .build());
        }
    }

    /** 单号 = 前缀 + 毫秒时间戳(17位) + 主键随机段派生(6位)，总长 ≤ 24，列宽 32 装得下 */
    private static String generateNo(String prefix, UUID id) {
        return prefix
                + OffsetDateTime.now().format(NO_FMT)
                + "%06d".formatted(Math.floorMod(id.getLeastSignificantBits(), 1_000_000));
    }

    private static Money sum(List<CheckoutPreview.Group> groups, Function<CheckoutPreview.Group, Money> amount) {
        return groups.stream().map(amount).reduce(Money.zero(Money.CNY), Money::plus);
    }

    // 内部：查询与装配辅助
    /**
     * 状态筛选档归一：非法值 400（闸门在 service），不传即「全部档」给 mapper 一个 null。
     * 注意子订单已无 PENDING_PAYMENT：买家「待付款」档由主订单筛选，批次⑤接投影时切换。
     */
    private static OrderStatus filterStatus(String status) {
        return Validate.enumFilter(OrderStatus.class, status, "非法的订单状态筛选值");
    }

    /** 订单 + 行项 + 主订单（收货快照/支付时限/幂等键都在主订单上） */
    private OrderWithItems withItems(Order order) {
        return new OrderWithItems(
                order, orderItemMapper.selectByOrderId(order.getId()), tradeMapper.selectById(order.getTradeId()));
    }

    /**
     * 一批主订单 → 卡片视图：子订单、行项、店名、主进度各自一次批查，装配阶段零 N+1。
     *
     * <p>主进度读 {@code orders.trade_progress}：视图对每张主订单恰好一行，所以这里直接按 id 取，
     * 取不到才是真异常（视图与主订单表同行数）——不做兜底值，兜出来的「已关闭」会骗人。
     */
    private List<TradeListItemView> assembleTrades(List<Trade> trades) {
        if (trades.isEmpty()) {
            return List.of();
        }
        List<UUID> tradeIds = trades.stream().map(Trade::getId).toList();
        List<Order> children = orderMapper.selectByTradeIds(tradeIds);
        Map<UUID, List<Order>> childrenByTrade = children.stream().collect(Collectors.groupingBy(Order::getTradeId));
        Map<UUID, List<OrderItem>> itemsByOrder = children.isEmpty()
                ? Map.of()
                : orderItemMapper
                        .selectByOrderIds(children.stream().map(Order::getId).toList())
                        .stream()
                        .collect(Collectors.groupingBy(OrderItem::getOrderId));
        Map<UUID, String> shopNames = shopReadQuery.namesByIds(
                children.stream().map(Order::getShopId).distinct().toList());
        Map<UUID, MainProgress> progress = tradeMapper.mainProgressOf(tradeIds).stream()
                .collect(Collectors.toMap(
                        TradeMapper.TradeProgressRow::tradeId, TradeMapper.TradeProgressRow::mainProgress));
        return trades.stream()
                .map(trade -> TradeListItemView.from(
                        trade,
                        progress.get(trade.getId()),
                        childrenByTrade.getOrDefault(trade.getId(), List.of()).stream()
                                .map(order -> TradeListItemView.TradeOrderView.from(
                                        order, itemsByOrder.getOrDefault(order.getId(), List.of()), shopNames))
                                .toList()))
                .toList();
    }

    private List<OrderWithItems> attachItems(List<Order> orders) {
        if (orders.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<OrderItem>> items =
                orderItemMapper
                        .selectByOrderIds(orders.stream().map(Order::getId).toList())
                        .stream()
                        .collect(Collectors.groupingBy(OrderItem::getOrderId));
        Map<UUID, Trade> trades =
                tradeMapper
                        .selectBatchIds(orders.stream()
                                .map(Order::getTradeId)
                                .distinct()
                                .toList())
                        .stream()
                        .collect(Collectors.toMap(Trade::getId, Function.identity()));
        return orders.stream()
                .map(o -> new OrderWithItems(o, items.getOrDefault(o.getId(), List.of()), trades.get(o.getTradeId())))
                .toList();
    }

    /** 结算有效行 → 库存结算行：下单冻结直接吃解析结果，免重查刚落库的行项目 */
    private static List<StockLine> stockLinesOf(List<ValidLine> lines) {
        return lines.stream().map(l -> new StockLine(l.skuId(), l.quantity())).toList();
    }
}
