package com.shop.platform.order.service;

import static com.shop.platform.order.mapper.Order.STATUS_CANCELLED;
import static com.shop.platform.order.mapper.Order.STATUS_COMPLETED;
import static com.shop.platform.order.mapper.Order.STATUS_PAID;
import static com.shop.platform.order.mapper.Order.STATUS_PENDING_PAYMENT;
import static com.shop.platform.order.mapper.Order.STATUS_SHIPPED;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.db.CrossSchemaReader;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.PreviewOrderRequest;
import com.shop.platform.order.dto.ShipOrderRequest;
import com.shop.platform.order.events.CartCheckedOutEvent;
import com.shop.platform.order.events.OrderCancelledEvent;
import com.shop.platform.order.events.OrderCreatedEvent;
import com.shop.platform.order.events.OrderLine;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.OrderItem;
import com.shop.platform.order.mapper.OrderItemMapper;
import com.shop.platform.order.mapper.OrderMapper;
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
 * <p>事务与事件约定：下单/取消在事务内发布事件，product / cart 模块同步监听（同一事务）——
 * 库存不足则整单回滚，订单取消与库存回补原子生效。金额一律以 DB 投影计算，前端传入的只作展示。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class OrderService {

    /** 待付款超时分钟数，超时由定时任务关单回补库存 */
    private static final int PAY_EXPIRE_MINUTES = 15;

    /** 超时关单单批上限：部分索引全集有限，分批跑防任务线程长事务 */
    private static final int CLOSE_BATCH_LIMIT = 100;

    /** 单行购买数量上限，与 cart.items 的 CHECK 同值兜底 */
    private static final int MAX_QUANTITY_PER_LINE = 999;

    // product schema 的状态值约定（裸 SQL 只读访问，不 import 对方模块类）
    private static final int SKU_STATUS_ON_SALE = 1;

    private static final int PRODUCT_STATUS_PUBLISHED = 1;

    /** product.skus 投影列（结算需要的快照与可用性字段） */
    private static final List<String> SKU_COLUMNS =
            List.of("product_id", "name", "image", "price", "original_price", "currency", "stock", "status");

    /** product.products 投影列（分组 shopId + 主图回落 + 上架状态） */
    private static final List<String> PRODUCT_COLUMNS = List.of("shop_id", "main_image", "status");

    /** user_profile.addresses 投影列（收货快照来源） */
    private static final List<String> ADDRESS_COLUMNS =
            List.of("user_id", "receiver_name", "phone", "province", "city", "district", "detail", "deleted_at");

    /** cart.items 投影列（结算条目来源；按 ID 点查后内存过滤归属） */
    private static final List<String> CART_COLUMNS = List.of("user_id", "sku_id", "quantity");

    private final OrderMapper orderMapper;

    private final OrderItemMapper orderItemMapper;

    private final CrossSchemaReader reader;

    private final ApplicationEventPublisher events;

    private static final DateTimeFormatter ORDER_NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    private static final AtomicLong ORDER_NO_SEQ = new AtomicLong();

    // ========== 结算预览 ==========

    /** 结算预览：只读。有效行按店铺分组算钱，失效/缺货行平铺置灰，地址可选回显 */
    public CheckoutPreview preview(UUID userId, PreviewOrderRequest req) {
        // 1. 解析条目并判定可售性（跨 schema 只读点查，禁止 JOIN）
        ResolvedCheckout resolved = resolve(userId, req.cartItemIds(), req.buySkuId(), req.buyQuantity());

        // 2. 有效行按店铺分组算钱 —— 分组即拆单预告
        List<CheckoutPreview.Group> groups = groupByShop(resolved.valid());
        Money totalPayAmount =
                groups.stream().map(CheckoutPreview.Group::payAmount).reduce(Money.cny(0), Money::plus);

        // 3. 地址回显：传了就校验归属并镜像，没传返回 null（前端持有地址列表自行默认勾选）
        CheckoutPreview.Address address = req.addressId() != null ? loadAddress(userId, req.addressId()) : null;

        return new CheckoutPreview(groups, resolved.unavailable(), address, totalPayAmount);
    }

    // ========== 创建订单 ==========

    /**
     * 创建订单：一次结算按店铺拆成 N 单，全成全败。
     * 库存最终闸门在 product 模块的同步监听里（条件扣减失败 → 本事务整体回滚）。
     */
    @Transactional
    public List<Order> create(UUID userId, CreateOrderRequest req) {
        // 1. 校验收货地址归属并取快照（下单定格，之后改/删地址不影响本单）
        AddressSnapshot address = loadAddressRow(userId, req.addressId()).snapshot();

        // 2. 全量有效才允许下单：任一行失效或缺货直接拒绝（预览页已提示过，这里兜底并发变化）
        ResolvedCheckout resolved = resolve(userId, req.cartItemIds(), req.buySkuId(), req.buyQuantity());
        Validate.isTrue(resolved.unavailable().isEmpty(), "部分商品已下架或库存不足，请重新确认结算");

        // 3. 按店铺拆单落库：主表 + 行项目两份快照
        Map<UUID, List<ValidLine>> byShop = resolved.valid().stream()
                .collect(Collectors.groupingBy(ValidLine::shopId, LinkedHashMap::new, Collectors.toList()));
        List<Order> created = new ArrayList<>();
        for (List<ValidLine> lines : byShop.values()) {
            created.add(persistOrder(userId, req.buyerMessage(), address, lines));
        }

        // 4. 发领域事件（同事务同步监听）：product 条件扣减库存（不足抛 409 回滚全部），cart 删除已购条目
        for (Order order : created) {
            List<OrderItem> items = itemsByOrder(order.getId());
            events.publishEvent(new OrderCreatedEvent(order.getId(), toStockLines(items)));
        }
        List<UUID> cartItemIds = distinct(req.cartItemIds());
        if (!cartItemIds.isEmpty()) {
            events.publishEvent(new CartCheckedOutEvent(userId, cartItemIds));
        }
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
        return new OrderWithItems(order, itemsByOrder(order.getId()));
    }

    // ========== 状态机：买家操作 ==========

    /** 买家取消：仅待付款/待发货可取消，库存回补经事件与取消同事务生效 */
    @Transactional
    public void cancel(UUID userId, UUID orderId, String reason) {
        // 1. 归属校验
        Order order = requireOwned(userId, orderId);

        // 2. 取出行项供回补库存
        List<OrderItem> items = itemsByOrder(order.getId());

        // 3. 条件转移：抢不到说明已被支付/发货/关闭，让前端刷新重试
        int affected = orderMapper.update(
                null,
                condition(orderId)
                        .in(Order::getStatus, STATUS_PENDING_PAYMENT, STATUS_PAID)
                        .set(Order::getStatus, STATUS_CANCELLED)
                        .set(Order::getCancelledAt, OffsetDateTime.now())
                        .set(Order::getCancelReason, reason == null || reason.isBlank() ? null : reason.trim()));
        Validate.isTrue(affected == 1, 409, "订单状态已变更，当前不可取消");

        // 4. 发取消事件：product 同步回补库存
        events.publishEvent(new OrderCancelledEvent(orderId, toStockLines(items)));
        log.info("[ORDER] 买家取消订单, orderId={}, userId={}", orderId, userId);
    }

    /** 确认收货：已发货 → 已完成 */
    @Transactional
    public void receive(UUID userId, UUID orderId) {
        requireOwned(userId, orderId);
        int affected = orderMapper.update(
                null,
                condition(orderId)
                        .eq(Order::getStatus, STATUS_SHIPPED)
                        .set(Order::getStatus, STATUS_COMPLETED)
                        .set(Order::getCompletedAt, OffsetDateTime.now()));
        Validate.isTrue(affected == 1, 409, "订单状态已变更，当前不可确认收货");
    }

    // ========== 状态机：卖家操作 ==========

    /** 发货：待发货 → 已发货，回填物流信息（一单一包裹） */
    @Transactional
    public void ship(UUID shopId, UUID orderId, ShipOrderRequest req) {
        // 1. 条件转移：限定本店 + 待发货态，越店与错态都在影响行数上暴露
        int affected = orderMapper.update(
                null,
                condition(orderId)
                        .eq(Order::getShopId, shopId)
                        .eq(Order::getStatus, STATUS_PAID)
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
        return new OrderWithItems(order, itemsByOrder(order.getId()));
    }

    // ========== 状态机：系统 ==========

    /** 支付成功的落点：payment 模块同事务调用；条件转移失败抛 409 连带支付流水一起回滚 */
    @Transactional
    public void markPaid(UUID orderId) {
        int affected = orderMapper.update(
                null,
                condition(orderId)
                        .eq(Order::getStatus, STATUS_PENDING_PAYMENT)
                        .set(Order::getStatus, STATUS_PAID)
                        .set(Order::getPaidAt, OffsetDateTime.now()));
        Validate.isTrue(affected == 1, 409, "订单已取消或已支付，本次支付未生效");
    }

    /** 超时关单：扫描过期待付款单逐笔关闭并回补库存，返回关单数（定时任务入口） */
    @Transactional
    public int closeExpired() {
        // 1. 扫描过期待付款单（命中 idx_orders_pay_expire 部分索引），限量分批
        List<Order> expired = orderMapper.selectList(new LambdaQueryWrapper<Order>()
                .eq(Order::getStatus, STATUS_PENDING_PAYMENT)
                .lt(Order::getPayExpireAt, OffsetDateTime.now())
                .orderByAsc(Order::getPayExpireAt)
                .last("LIMIT " + CLOSE_BATCH_LIMIT));
        if (expired.isEmpty()) {
            return 0;
        }

        // 2. 批量取行项，供逐笔回补
        List<OrderItem> allItems = orderItemMapper.selectList(new LambdaQueryWrapper<OrderItem>()
                .in(OrderItem::getOrderId, expired.stream().map(Order::getId).toList()));

        int closed = 0;
        for (Order order : expired) {
            // 3. 条件更新防竞态：手动支付/取消先到先得，本任务让位
            int affected = orderMapper.update(
                    null,
                    condition(order.getId())
                            .eq(Order::getStatus, STATUS_PENDING_PAYMENT)
                            .set(Order::getStatus, STATUS_CANCELLED)
                            .set(Order::getCancelledAt, OffsetDateTime.now())
                            .set(Order::getCancelReason, "超时未支付，自动关闭"));
            if (affected == 1) {
                // 4. 回补库存（同事务）
                List<OrderLine> lines = allItems.stream()
                        .filter(i -> i.getOrderId().equals(order.getId()))
                        .map(this::toStockLine)
                        .toList();
                events.publishEvent(new OrderCancelledEvent(order.getId(), lines));
                closed++;
            }
        }
        return closed;
    }

    // ========== 内部：条目解析与快照 ==========

    /**
     * 结算条目解析：购物车模式从 cart.items 点查自己的条目（内存过滤归属），立即购买模式直接用请求参数；
     * 再对 product 做「SKU 在售 + SPU 上架 + 库存充足」三道判定，产出有效行与置灰行。
     */
    private ResolvedCheckout resolve(UUID userId, List<UUID> cartItemIds, UUID buySkuId, Integer buyQuantity) {
        // 1. 来源二选一，立即购买数量封顶
        boolean cartMode = cartItemIds != null && !cartItemIds.isEmpty();
        boolean buyMode = buySkuId != null;
        Validate.isTrue(cartMode ^ buyMode, "购物车结算与立即购买只能二选一");
        Validate.isTrue(!buyMode || (buyQuantity != null && buyQuantity >= 1), "购买数量至少 1 件");

        // 2. 组装请求行 (skuId, quantity, cartItemId?)
        List<RequestedLine> requested = new ArrayList<>();
        if (buyMode) {
            requested.add(new RequestedLine(buySkuId, Math.min(buyQuantity, MAX_QUANTITY_PER_LINE), null));
        } else {
            // 跨 schema 按 ID 只读点查购物车条目；不存在或非本人的 ID 静默忽略（不泄露他车内容）
            LinkedHashSet<UUID> ids = new LinkedHashSet<>(cartItemIds);
            Map<UUID, CartRow> rows = reader.byIds(
                    "cart.items",
                    CART_COLUMNS,
                    ids,
                    rs -> new CartRow(
                            rs.getObject("user_id", UUID.class),
                            rs.getObject("sku_id", UUID.class),
                            rs.getInt("quantity")));
            for (UUID id : ids) {
                CartRow row = rows.get(id);
                if (row != null && row.userId().equals(userId)) {
                    requested.add(new RequestedLine(row.skuId(), row.quantity(), id));
                }
            }
            Validate.isTrue(!requested.isEmpty(), "结算条目不存在或已被处理");
        }

        // 3. 批量拉 SKU / SPU 投影
        List<UUID> skuIds =
                requested.stream().map(RequestedLine::skuId).distinct().toList();
        Map<UUID, SkuRow> skus = reader.byIds(
                "product.skus",
                SKU_COLUMNS,
                skuIds,
                rs -> new SkuRow(
                        rs.getObject("product_id", UUID.class),
                        rs.getString("name"),
                        rs.getString("image"),
                        rs.getObject("price", Long.class),
                        rs.getObject("original_price", Long.class),
                        rs.getString("currency"),
                        rs.getObject("stock", Integer.class),
                        rs.getObject("status", Integer.class)));
        Map<UUID, ProductRow> products = reader.byIds(
                "product.products",
                PRODUCT_COLUMNS,
                skus.values().stream().map(SkuRow::productId).distinct().toList(),
                rs -> new ProductRow(
                        rs.getObject("shop_id", UUID.class),
                        rs.getString("main_image"),
                        rs.getObject("status", Integer.class)));

        // 4. 逐行三道判定：缺失/停售 → UNAVAILABLE；在售但库存不足 → STOCK_SHORTAGE；否则进有效行
        List<ValidLine> valid = new ArrayList<>();
        List<CheckoutPreview.UnavailableLine> unavailable = new ArrayList<>();
        for (RequestedLine line : requested) {
            SkuRow sku = skus.get(line.skuId());
            boolean onSale = sku != null && sku.status() == SKU_STATUS_ON_SALE && products.containsKey(sku.productId());
            if (!onSale) {
                unavailable.add(new CheckoutPreview.UnavailableLine(
                        line.skuId(),
                        sku != null ? sku.name() : null,
                        sku != null ? sku.image() : null,
                        line.quantity(),
                        CheckoutPreview.UnavailableLine.CAUSE_UNAVAILABLE));
                continue;
            }
            ProductRow product = products.get(sku.productId());
            if (product.status() != PRODUCT_STATUS_PUBLISHED) {
                unavailable.add(new CheckoutPreview.UnavailableLine(
                        line.skuId(),
                        sku.name(),
                        sku.image(),
                        line.quantity(),
                        CheckoutPreview.UnavailableLine.CAUSE_UNAVAILABLE));
                continue;
            }
            if (sku.stock() == null || sku.stock() < line.quantity()) {
                unavailable.add(new CheckoutPreview.UnavailableLine(
                        line.skuId(),
                        sku.name(),
                        sku.image(),
                        line.quantity(),
                        CheckoutPreview.UnavailableLine.CAUSE_STOCK_SHORTAGE));
                continue;
            }
            // 图片解析在此定型：SKU 图空则回落 SPU 主图，落库即终值，读端零逻辑；金额在此定型为 Money
            valid.add(new ValidLine(
                    line.skuId(),
                    sku.productId(),
                    product.shopId(),
                    sku.name(),
                    sku.image() != null ? sku.image() : product.mainImage(),
                    Money.ofFen(sku.price(), sku.currency()),
                    sku.originalPrice() != null ? Money.ofFen(sku.originalPrice(), sku.currency()) : null,
                    line.quantity(),
                    sku.stock()));
        }
        // 总额口径与分组小计（sumLines）同源，不会漂移
        return new ResolvedCheckout(valid, unavailable, sumLines(valid));
    }

    /** 有效行按店铺分组算钱；店铺名跨 schema 只读拼装（一组对应一笔待创建订单） */
    private List<CheckoutPreview.Group> groupByShop(List<ValidLine> valid) {
        Map<UUID, List<ValidLine>> byShop = valid.stream()
                .collect(Collectors.groupingBy(ValidLine::shopId, LinkedHashMap::new, Collectors.toList()));
        Map<UUID, String> shopNames = reader.stringsByIds("shop.shops", "name", byShop.keySet());
        return byShop.entrySet().stream()
                .map(e -> {
                    List<CheckoutPreview.Line> lines =
                            e.getValue().stream().map(this::toPreviewLine).toList();
                    Money itemAmount = sumLines(e.getValue());
                    return new CheckoutPreview.Group(
                            e.getKey(), shopNames.get(e.getKey()), lines, itemAmount, Money.cny(0), itemAmount);
                })
                .toList();
    }

    private CheckoutPreview.Line toPreviewLine(ValidLine l) {
        return new CheckoutPreview.Line(
                l.skuId(), l.productId(), l.name(), l.image(), l.price(), l.originalPrice(), l.quantity(), l.stock());
    }

    private Money sumLines(List<ValidLine> lines) {
        return lines.stream().map(l -> l.price().times(l.quantity())).reduce(Money.cny(0), Money::plus);
    }

    /** 落一笔订单：主表快照 + 行项目快照；orderNo 极小概率撞号时换号重插 */
    private Order persistOrder(UUID userId, String buyerMessage, AddressSnapshot addr, List<ValidLine> lines) {
        Money itemAmount = sumLines(lines);
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
        Map<UUID, List<OrderItem>> grouped = orderItemMapper
                .selectList(new LambdaQueryWrapper<OrderItem>()
                        .in(
                                OrderItem::getOrderId,
                                orders.stream().map(Order::getId).toList()))
                .stream()
                .collect(Collectors.groupingBy(OrderItem::getOrderId));
        return orders.stream()
                .map(o -> new OrderWithItems(o, grouped.getOrDefault(o.getId(), List.of())))
                .toList();
    }

    private List<OrderItem> itemsByOrder(UUID orderId) {
        return orderItemMapper.selectList(new LambdaQueryWrapper<OrderItem>().eq(OrderItem::getOrderId, orderId));
    }

    /** 更新起点：主键定位 + 影响行数即乐观闸门 */
    private static LambdaUpdateWrapper<Order> condition(UUID orderId) {
        return new LambdaUpdateWrapper<Order>().eq(Order::getId, orderId);
    }

    private List<OrderLine> toStockLines(List<OrderItem> items) {
        return items.stream().map(this::toStockLine).toList();
    }

    private OrderLine toStockLine(OrderItem item) {
        return new OrderLine(item.getSkuId(), item.getQuantity());
    }

    private CheckoutPreview.Address loadAddress(UUID userId, UUID addressId) {
        return new CheckoutPreview.Address(
                addressId, loadAddressRow(userId, addressId).snapshot());
    }

    /** 地址快照来源：归属本人且未删除，否则 404（预览与创建共用一道门）；列 → 快照的组装收敛在此一处 */
    private AddressRow loadAddressRow(UUID userId, UUID addressId) {
        AddressRow row = reader.byId(
                        "user_profile.addresses",
                        ADDRESS_COLUMNS,
                        addressId,
                        rs -> new AddressRow(
                                rs.getObject("user_id", UUID.class),
                                new AddressSnapshot(
                                        rs.getString("receiver_name"),
                                        rs.getString("phone"),
                                        rs.getString("province"),
                                        rs.getString("city"),
                                        rs.getString("district"),
                                        rs.getString("detail")),
                                rs.getObject("deleted_at", OffsetDateTime.class)))
                .orElseThrow(() -> BusinessException.notFound("收货地址不存在"));
        Validate.isTrue(row.userId().equals(userId), "收货地址不存在");
        Validate.isTrue(row.deletedAt() == null, "收货地址不存在");
        return row;
    }

    private static List<UUID> distinct(List<UUID> ids) {
        return ids == null ? List.of() : new ArrayList<>(new LinkedHashSet<>(ids));
    }

    // ---- 内部投影 record：字段镜像 DB 现状，仅在本 service 内流通 ----

    /** 结算请求行：立即购买时 cartItemId 为 null */
    private record RequestedLine(UUID skuId, int quantity, UUID cartItemId) {}

    /** 跨 schema 点查通过后的有效行：携带分组所需 shopId 与全部快照字段；价格在入口已定型为 Money */
    private record ValidLine(
            UUID skuId,
            UUID productId,
            UUID shopId,
            String name,
            String image,
            Money price,
            Money originalPrice,
            int quantity,
            int stock) {}

    private record ResolvedCheckout(
            List<ValidLine> valid, List<CheckoutPreview.UnavailableLine> unavailable, Money totalPayAmount) {}

    private record CartRow(UUID userId, UUID skuId, int quantity) {}

    private record SkuRow(
            UUID productId,
            String name,
            String image,
            Long price,
            Long originalPrice,
            String currency,
            Integer stock,
            Integer status) {}

    private record ProductRow(UUID shopId, String mainImage, Integer status) {}

    private record AddressRow(UUID userId, AddressSnapshot snapshot, OffsetDateTime deletedAt) {}
}
