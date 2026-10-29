package com.shop.platform.trade.service;

import com.shop.platform.account.api.AddressReadQuery;
import com.shop.platform.account.api.AddressSnapshotView;
import com.shop.platform.catalog.api.CatalogCommand;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.BizNo;
import com.shop.platform.common.id.Ids;
import com.shop.platform.common.money.Money;
import com.shop.platform.infra.db.JsonColumns;
import com.shop.platform.inventory.api.InventoryCommand;
import com.shop.platform.inventory.api.ReserveRequest;
import com.shop.platform.pricing.api.PricingQuery;
import com.shop.platform.pricing.api.PricingQuery.DiscountSnapshot;
import com.shop.platform.pricing.api.PricingQuery.LineSnapshot;
import com.shop.platform.pricing.api.PricingQuery.QuoteSnapshot;
import com.shop.platform.pricing.api.PricingRequest;
import com.shop.platform.trade.api.PlaceOrderRequest;
import com.shop.platform.trade.api.TradeCommand;
import com.shop.platform.trade.events.OrderCompleted;
import com.shop.platform.trade.events.OrderGroupPlaced;
import com.shop.platform.trade.events.SellerOrderPlaced;
import com.shop.platform.trade.mapper.OrderEventMapper;
import com.shop.platform.trade.mapper.OrderGroupMapper;
import com.shop.platform.trade.mapper.OrderLineMapper;
import com.shop.platform.trade.mapper.SellerOrderMapper;
import com.shop.platform.trade.model.CloseReason;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 落单。整条链路在一个事务里，任何一步失败就整单回滚。
 *
 * <p>顺序不能换：<b>幂等重放 → 取地址快照 → 校验报价 → 定好子单 id → 占库存 → 插三层订单 → 发事件</b>。
 *
 * <ul>
 *   <li>地址先于报价解析：地址都拿不到（查无/不归本人）就别白烧一张报价单
 *   <li>报价的 {@code issued→used} CAS 与插单必须同事务。先置 used 再插单、插单失败就白烧一张报价；
 *       先插单再置 used，并发下两张单会拿到同一张报价
 *   <li>库存必须同步。异步化会造出"订单成立但没占到货"，那就是超卖
 *   <li>子单 id 必须在预占之前生成：库存的幂等键是 {@code (seller_order_id, line_no)}，
 *       用 group id 会让多商家订单在 {@code line_no} 上撞车
 * </ul>
 */
@Component
public class TradeService implements TradeCommand {

    /** 付款期限，与报价单 30 分钟一致。 */
    private static final Duration TTL = Duration.ofMinutes(30);

    private final AddressReadQuery addresses;
    private final PricingQuery pricing;
    private final InventoryCommand inventory;
    private final CatalogCommand catalog;
    private final OrderGroupMapper groups;
    private final SellerOrderMapper sellerOrders;
    private final OrderLineMapper lines;
    private final OrderEventMapper events;
    private final ApplicationEventPublisher publisher;

    public TradeService(
            AddressReadQuery addresses,
            PricingQuery pricing,
            InventoryCommand inventory,
            CatalogCommand catalog,
            OrderGroupMapper groups,
            SellerOrderMapper sellerOrders,
            OrderLineMapper lines,
            OrderEventMapper events,
            ApplicationEventPublisher publisher) {
        this.addresses = Objects.requireNonNull(addresses, "addresses");
        this.pricing = Objects.requireNonNull(pricing, "pricing");
        this.inventory = Objects.requireNonNull(inventory, "inventory");
        this.catalog = Objects.requireNonNull(catalog, "catalog");
        this.groups = Objects.requireNonNull(groups, "groups");
        this.sellerOrders = Objects.requireNonNull(sellerOrders, "sellerOrders");
        this.lines = Objects.requireNonNull(lines, "lines");
        this.events = Objects.requireNonNull(events, "events");
        this.publisher = Objects.requireNonNull(publisher, "publisher");
    }

    @Override
    @Transactional
    public PlacedOrder placeOrder(PlaceOrderRequest request) {
        // 0. 幂等：同键的并发请求在事务锁上排队，先到的提交后后到的直接拿原单。
        // 没有这段，客户端重新试算拿个新 quoteId 再发一遍，就能对同一车货下两单、占两份库存
        String idempotencyKey = request.idempotencyKey();
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            groups.lockIdempotency(request.buyerId() + ":" + idempotencyKey);
            Optional<OrderGroupMapper.GroupRow> replayed =
                    groups.findByIdempotencyKey(request.buyerId(), idempotencyKey);
            if (replayed.isPresent()) {
                return replayOf(replayed.get());
            }
        }

        // 1. 地址：按 id 取本人地址簿快照。归属在 SQL 里（id + buyerId 双条件），
        // 查无此地址与"不是你的地址"同一句 404，防枚举
        AddressSnapshotView address = addresses
                .byId(request.addressId(), request.buyerId())
                .orElseThrow(() -> BusinessException.notFound("地址不存在: " + request.addressId()));

        // 2. 校验报价（并 CAS 置 used）。不一致就 PRICE_CHANGED，什么都不写
        QuoteSnapshot quote = pricing.consumeForOrder(request.quoteId(), toPricingRequest(request, address));

        UUID groupId = Ids.newId();
        Instant expiresAt = Instant.now().plus(TTL);
        String addressJson = writeJson(new ShipAddress(
                address.receiverName(),
                address.phone(),
                address.regionCode(),
                address.province(),
                address.city(),
                address.district(),
                address.detail()));

        // 3. 按商家分组，先把子单 id 全部定下来——预占的幂等键要用它
        Map<UUID, List<LineSnapshot>> byMerchant = new LinkedHashMap<>();
        for (LineSnapshot line : quote.lines()) {
            byMerchant
                    .computeIfAbsent(line.merchantId(), key -> new ArrayList<>())
                    .add(line);
        }
        Map<UUID, UUID> sellerOrderIdOf = new LinkedHashMap<>();
        for (UUID merchantId : byMerchant.keySet()) {
            sellerOrderIdOf.put(merchantId, Ids.newId());
        }

        // 4. 占库存：按子单分组预占，幂等键 (seller_order_id, line_no) 才对得上。
        // 行序必须全库一致（按 skuId 升序），否则两个订单以相反行序买同一组 SKU，
        // 行锁互相等——死锁，而且牺牲品会被误报成库存不足
        List<ReserveRequest> reserveRequests = new ArrayList<>(byMerchant.size());
        for (Map.Entry<UUID, List<LineSnapshot>> entry : byMerchant.entrySet()) {
            UUID sellerOrderId = sellerOrderIdOf.get(entry.getKey());
            reserveRequests.add(new ReserveRequest(
                    groupId,
                    sellerOrderId,
                    entry.getValue().stream()
                            .map(line -> new ReserveRequest.Line(
                                    line.skuId(), line.merchantId(), line.lineNo(), line.quantity()))
                            .sorted(Comparator.comparing(ReserveRequest.Line::skuId))
                            .toList(),
                    expiresAt));
        }
        reserveRequests.sort(
                Comparator.comparing(request0 -> request0.lines().getFirst().skuId()));
        // 不够卖时这里抛 INSUFFICIENT_STOCK，整个事务回滚——包括刚才的报价 CAS
        reserveRequests.forEach(inventory::reserve);

        // 5. 插订单组
        long shippingTotal = quote.shippingByShop().stream()
                .mapToLong(item -> item.amount().amount())
                .sum();
        groups.insert(new OrderGroupMapper.NewGroup(
                groupId,
                BizNo.of("PO", LocalDate.now(ZoneId.systemDefault())),
                request.buyerId(),
                request.quoteId(),
                quote.currency(),
                quote.goods().amount(),
                quote.discount().amount(),
                shippingTotal,
                quote.payableAmount().amount(),
                addressJson,
                expiresAt,
                idempotencyKey));

        // 6. 插子单 + 行 + 分摊
        Map<UUID, Long> shippingByMerchant = new LinkedHashMap<>();
        for (PricingQuery.ShippingSnapshot shipping : quote.shippingByShop()) {
            shippingByMerchant.merge(shipping.merchantId(), shipping.amount().amount(), Long::sum);
        }

        List<SellerOrderPlaced> pending = new ArrayList<>(byMerchant.size());
        for (Map.Entry<UUID, List<LineSnapshot>> entry : byMerchant.entrySet()) {
            UUID merchantId = entry.getKey();
            List<LineSnapshot> merchantLines = entry.getValue();
            UUID sellerOrderId = sellerOrderIdOf.get(merchantId);
            pending.add(insertSellerOrder(
                    sellerOrderId, groupId, merchantId, merchantLines, shippingByMerchant, quote, addressJson));
        }

        recordEvent(groupId, "payment", null, "unpaid", "buyer", request.buyerId(), "下单");

        // 7. 发事件：与业务数据同事务落 outbox。组级事件带 buyerId + skuIds 全集，购物车清车只认它——
        //    子单事件没有买家维度，清不了车
        pending.forEach(publisher::publishEvent);
        publisher.publishEvent(new OrderGroupPlaced(
                Ids.newId(),
                groupId,
                request.buyerId(),
                quote.lines().stream().map(LineSnapshot::skuId).distinct().toList(),
                Instant.now()));

        return new PlacedOrder(
                groupId,
                groups.findInternal(groupId).orElseThrow().groupNo(),
                List.copyOf(sellerOrderIdOf.values()),
                quote.payableAmount(),
                expiresAt);
    }

    /** 同幂等键的重放请求：原单已经成立，把它的形状原样读出来返回，不再占任何资源。 */
    private PlacedOrder replayOf(OrderGroupMapper.GroupRow group) {
        List<UUID> sellerOrderIds = sellerOrders.findByGroupInternal(group.id()).stream()
                .map(SellerOrderMapper.SellerOrderRow::id)
                .toList();
        return new PlacedOrder(
                group.id(),
                group.groupNo(),
                sellerOrderIds,
                new Money(group.payableAmount(), group.currency()),
                group.expiresAt());
    }

    @Override
    @Transactional
    public boolean cancelUnpaid(UUID orderGroupId, UUID buyerId) {
        // 归属校验必须在这里，而且必须抛 404：告诉对方"这个 id 存在但不是你的"本身就是信息泄露，
        // 拿它当枚举器就能确认哪些订单号真实存在。别的买家入口也是这个口径。
        OrderGroupMapper.GroupRow group = groups.findInternal(orderGroupId)
                .filter(row -> row.buyerId().equals(buyerId))
                .orElseThrow(() -> BusinessException.notFound("订单不存在: " + orderGroupId));

        // 取消整单要写两个维度：先子单、再组，同一事务。
        // 只写组的话子单还开着，买家页和商家页会显示两个状态
        List<SellerOrderMapper.SellerOrderRow> sellerOrdersOfGroup = sellerOrders.findByGroupInternal(group.id());

        if (!groups.close(orderGroupId, CloseReason.BUYER_CANCELLED)) {
            // 已经被支付回调或超时任务抢先，什么都没改
            return false;
        }
        for (SellerOrderMapper.SellerOrderRow sellerOrder : sellerOrdersOfGroup) {
            sellerOrders.close(sellerOrder.id(), CloseReason.BUYER_CANCELLED);
        }
        // 立刻放回库存，不等 expires_at 兜底——那会让货多占 10 分钟
        releaseReservations(sellerOrdersOfGroup);

        recordEvent(orderGroupId, "close", "unpaid", "buyer_cancelled", "buyer", buyerId, "买家取消");
        return true;
    }

    @Override
    @Transactional
    public boolean closeExpired(UUID orderGroupId) {
        List<SellerOrderMapper.SellerOrderRow> sellerOrdersOfGroup = sellerOrders.findByGroupInternal(orderGroupId);

        // 与支付回调用同一个前置条件，谁改到行谁赢
        if (!groups.close(orderGroupId, CloseReason.TIMEOUT)) {
            return false;
        }
        for (SellerOrderMapper.SellerOrderRow sellerOrder : sellerOrdersOfGroup) {
            sellerOrders.close(sellerOrder.id(), CloseReason.TIMEOUT);
        }
        releaseReservations(sellerOrdersOfGroup);

        recordEvent(orderGroupId, "close", "unpaid", "timeout", "system", null, "超时关单");
        return true;
    }

    /**
     * 释放本次取消涉及的所有预占。
     *
     * <p>一次批量调用，行序（warehouse, sku）由 inventory 统一决定——那是防死锁的全序，调用方别自己排。
     * 预占已经被兜底扫描放掉时，release 自己是幂等的，不会多放。
     */
    private void releaseReservations(List<SellerOrderMapper.SellerOrderRow> sellerOrdersOfGroup) {
        inventory.releaseAll(lines.lineRefsOf(sellerOrdersOfGroup.stream()
                .map(SellerOrderMapper.SellerOrderRow::id)
                .toList()));
    }

    /**
     * 回写发货数量，再从行计数器重算子单状态。
     *
     * <p><b>子单不存 shipped_qty。</b> 发几个包裹、发了几件，全看行上的计数器；
     * 子单状态是算出来的，不许手动 set。
     */
    @Override
    @Transactional
    public void recordShipment(UUID sellerOrderId, List<TradeCommand.ShipmentLine> shipmentLines) {
        for (TradeCommand.ShipmentLine line : shipmentLines) {
            if (!lines.addShipped(sellerOrderId, line.lineNo(), line.quantity())) {
                throw BusinessException.conflict(
                        "发货数量超过行数量: sellerOrder=" + sellerOrderId + " lineNo=" + line.lineNo());
            }
        }
        sellerOrders.recomputeFulfillment(sellerOrderId);

        SellerOrderMapper.SellerOrderRow sellerOrder = sellerOrders
                .findInternal(sellerOrderId)
                .orElseThrow(() -> BusinessException.notFound("子单不存在: " + sellerOrderId));
        events.append(
                eventKeyOf(sellerOrderId, "fulfillment", "shipped", shipmentLines),
                "seller_order",
                sellerOrderId,
                "fulfillment",
                "unshipped",
                sellerOrder.fulfillmentStatus(),
                "merchant",
                sellerOrder.merchantId(),
                "回写发货");
    }

    /**
     * 回写签收数量。全签收则子单 {@code received}；所有子单都 received 时整个订单完成。
     *
     * <p>订单完成靠**重算**判断，不靠"这一批是不是最后一批"：多包裹分批发货时，
     * 判断"这是不是最后一批"需要一个全局视图，而重算只需要一次聚合查询。
     */
    @Override
    @Transactional
    public void recordReceipt(UUID sellerOrderId, List<TradeCommand.ShipmentLine> receiptLines) {
        for (TradeCommand.ShipmentLine line : receiptLines) {
            if (!lines.addReceived(sellerOrderId, line.lineNo(), line.quantity())) {
                throw BusinessException.conflict(
                        "签收数量超过已发货量: sellerOrder=" + sellerOrderId + " lineNo=" + line.lineNo());
            }
        }
        sellerOrders.recomputeFulfillment(sellerOrderId);

        SellerOrderMapper.SellerOrderRow sellerOrder = sellerOrders
                .findInternal(sellerOrderId)
                .orElseThrow(() -> BusinessException.notFound("子单不存在: " + sellerOrderId));
        events.append(
                eventKeyOf(sellerOrderId, "fulfillment", "received", receiptLines),
                "seller_order",
                sellerOrderId,
                "fulfillment",
                "shipped",
                sellerOrder.fulfillmentStatus(),
                "channel",
                null,
                "回写签收");

        completeGroupIfAllReceived(sellerOrder.groupId());
    }

    /**
     * 回写退款数量与金额。由 {@code returns} 在退款成功后调，同一事务。
     *
     * <p>行上两条上限（件数、金额）都在 SQL 的 where 里，影响 0 行就抛——那说明售后算错了上限，
     * 不能默默记一半。组上的已退金额按行汇总加，保证 {@code Σ 行 = 组}。
     */
    @Override
    @Transactional
    public void recordRefund(UUID sellerOrderId, List<TradeCommand.RefundLine> refundLines) {
        long total = 0;
        for (TradeCommand.RefundLine line : refundLines) {
            if (!lines.addRefunded(line.orderLineId(), line.quantity(), line.amount())) {
                throw BusinessException.conflict("退款数量或金额超过上限: line=" + line.orderLineId() + " qty=" + line.quantity());
            }
            total += line.amount();
        }

        SellerOrderMapper.SellerOrderRow sellerOrder = sellerOrders
                .findInternal(sellerOrderId)
                .orElseThrow(() -> BusinessException.notFound("子单不存在: " + sellerOrderId));
        if (!groups.addRefunded(sellerOrder.groupId(), total)) {
            throw BusinessException.conflict("退款金额超过实收: group=" + sellerOrder.groupId());
        }

        events.append(
                "sellerOrder:" + sellerOrderId + ":refund:" + total,
                "seller_order",
                sellerOrderId,
                "aftersale",
                null,
                "refunded",
                "system",
                null,
                "回写退款");
    }

    /**
     * 所有子单都 {@code received} 时，订单组置完成并发 {@code OrderCompleted}。
     *
     * <p>幂等靠 {@code order_event} 的唯一键：同一个 group 的完成事件只会落一行，
     * 重复调用时 {@code append} 返回 false，事件就不重发。
     *
     * <p>不写 {@code closed_at}：完成不是关闭。已完成订单还要走售后和结算，
     * 给它一个关闭时间会让展示态变成"已取消"。
     */
    private void completeGroupIfAllReceived(UUID groupId) {
        List<SellerOrderMapper.SellerOrderRow> all = sellerOrders.findByGroupInternal(groupId);
        boolean allReceived =
                !all.isEmpty() && all.stream().allMatch(row -> "received".equals(row.fulfillmentStatus()));
        if (!allReceived) {
            return;
        }

        if (!events.append(
                "group:" + groupId + ":fulfillment:completed",
                "group",
                groupId,
                "fulfillment",
                null,
                "completed",
                "system",
                null,
                "全部签收")) {
            // 已经记过：重复调用不重发事件
            return;
        }

        // 销量投影与「已完成」同事务：订单成功才加，商品被删也只是 0 行。
        Map<UUID, Integer> quantities = new LinkedHashMap<>();
        for (SellerOrderMapper.SpuQuantity row : sellerOrders.quantitiesBySpu(
                all.stream().map(SellerOrderMapper.SellerOrderRow::id).toList())) {
            quantities.merge(row.spuId(), row.quantity(), Integer::sum);
        }
        catalog.addSold(quantities);

        publisher.publishEvent(new OrderCompleted(
                Ids.newId(),
                groupId,
                all.stream().map(SellerOrderMapper.SellerOrderRow::id).toList(),
                Instant.now()));
    }

    /**
     * 发货/签收事件的幂等键。
     *
     * <p>用"行号+数量"拼而不是用 {@code hashCode()}：hashCode 碰撞会把两笔不同的发货当成同一笔，
     * 那意味着第二批发货的数量永远不被记录，而账上看不出来。
     */
    private static String eventKeyOf(
            UUID sellerOrderId, String dimension, String to, List<TradeCommand.ShipmentLine> shipmentLines) {
        String detail = shipmentLines.stream()
                .sorted(java.util.Comparator.comparingInt(TradeCommand.ShipmentLine::lineNo))
                .map(line -> line.lineNo() + "x" + line.quantity())
                .reduce((left, right) -> left + "," + right)
                .orElse("");
        return "seller_order:" + sellerOrderId + ":" + dimension + ":" + to + ":" + detail;
    }

    private SellerOrderPlaced insertSellerOrder(
            UUID sellerOrderId,
            UUID groupId,
            UUID merchantId,
            List<LineSnapshot> merchantLines,
            Map<UUID, Long> shippingByMerchant,
            QuoteSnapshot quote,
            String addressJson) {
        UUID shopId = merchantLines.getFirst().shopId();
        long goods = merchantLines.stream()
                .mapToLong(line -> line.subtotal().amount())
                .sum();
        long discount = merchantLines.stream()
                .mapToLong(line -> line.discountAmount().amount())
                .sum();
        long shipping = shippingByMerchant.getOrDefault(merchantId, 0L);

        sellerOrders.insert(new SellerOrderMapper.NewSellerOrder(
                sellerOrderId,
                BizNo.of("SO", LocalDate.now(ZoneId.systemDefault())),
                groupId,
                merchantId,
                shopId,
                quote.currency(),
                goods,
                discount,
                shipping,
                goods - discount + shipping,
                addressJson));

        // 行 id 先全部定下来，分摊才挂得上；两张证据表各自攒一批一次写入
        List<OrderLineMapper.NewLine> newLines = new ArrayList<>(merchantLines.size());
        List<OrderLineMapper.NewDiscount> discounts = new ArrayList<>();
        for (LineSnapshot line : merchantLines) {
            UUID orderLineId = Ids.newId();
            newLines.add(new OrderLineMapper.NewLine(
                    orderLineId,
                    sellerOrderId,
                    line.lineNo(),
                    line.listingId(),
                    line.skuId(),
                    line.spuId(),
                    quote.currency(),
                    line.quantity(),
                    line.unitAmount().amount(),
                    line.subtotal().amount(),
                    line.discountAmount().amount(),
                    line.payableAmount().amount(),
                    line.title(),
                    line.imageUrl(),
                    line.specValuesJson() == null ? "{}" : line.specValuesJson(),
                    line.categoryId(),
                    line.brandId(),
                    line.identityKey(),
                    // 费率与版本归 governance，这一版还没接；先落 0 + 版本号占位，等 governance 的 commission 接口
                    0,
                    "v1",
                    line.sevenDayReturn()));
            for (DiscountSnapshot item : line.discounts()) {
                discounts.add(new OrderLineMapper.NewDiscount(
                        orderLineId,
                        item.ruleId(),
                        item.ruleVersion(),
                        item.type(),
                        item.bearer(),
                        quote.currency(),
                        item.amount().amount()));
            }
        }
        lines.insertAll(newLines);
        lines.insertDiscounts(discounts);

        return new SellerOrderPlaced(
                Ids.newId(),
                groupId,
                sellerOrderId,
                merchantId,
                merchantLines.stream()
                        .map(line -> new SellerOrderPlaced.Line(
                                line.lineNo(),
                                line.skuId(),
                                line.quantity(),
                                line.subtotal().amount(),
                                line.discountAmount().amount(),
                                line.payableAmount().amount()))
                        .toList(),
                goods,
                shipping,
                discount,
                Instant.now());
    }

    /**
     * 落一行。
     *
     * <p>所有快照列都来自报价单——那是"下单时是什么"的唯一来源。trade 不回查 catalog：
     * 回查既是竞态，也会让订单金额和商品状态脱钩（商品改了价，订单就该还是老价）。
     */
    /**
     * 拼出 pricing 的输入形状。
     *
     * <p>行号、数量、商家都要与算价时一致，否则 fingerprint 对不上，用户会被莫名要求重新确认——
     * 所以这里只搬运，不做任何"优化"。地址三段码由地址簿快照的区划码派生，与算价时同源。
     */
    private static PricingRequest toPricingRequest(PlaceOrderRequest request, AddressSnapshotView address) {
        List<PricingRequest.Line> rows = request.lines().stream()
                .map(line -> new PricingRequest.Line(
                        line.lineNo(), line.listingId(), line.skuId(), line.merchantId(), line.quantity()))
                .toList();
        return new PricingRequest(
                request.buyerId(),
                new PricingRequest.Address(address.provinceCode(), address.cityCode(), address.districtCode()),
                rows,
                List.of());
    }

    /**
     * 落进订单的收货地址快照。编码与名称都存：运费匹配要码，买家/商家展示要名——
     * 订单不回查地址簿，这里就是全部。
     */
    private record ShipAddress(
            String receiverName,
            String phone,
            String regionCode,
            String province,
            String city,
            String district,
            String detail) {}

    private void recordEvent(
            UUID groupId,
            String dimension,
            String from,
            String to,
            String operatorType,
            UUID operatorId,
            String reason) {
        events.append(
                "group:" + groupId + ":" + dimension + ":" + to,
                "group",
                groupId,
                dimension,
                from,
                to,
                operatorType,
                operatorId,
                reason);
    }

    private String writeJson(Object value) {
        return value == null ? "null" : JsonColumns.write(value);
    }
}
