package com.shop.platform.trade.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.BizNo;
import com.shop.platform.common.id.Ids;
import com.shop.platform.inventory.api.InventoryCommand;
import com.shop.platform.inventory.api.ReserveRequest;
import com.shop.platform.pricing.api.PricingQuery;
import com.shop.platform.pricing.api.PricingQuery.DiscountSnapshot;
import com.shop.platform.pricing.api.PricingQuery.LineSnapshot;
import com.shop.platform.pricing.api.PricingQuery.QuoteSnapshot;
import com.shop.platform.pricing.api.PricingRequest;
import com.shop.platform.trade.api.PlaceOrderRequest;
import com.shop.platform.trade.api.TradeCommand;
import com.shop.platform.trade.events.SellerOrderPlaced;
import com.shop.platform.trade.mapper.OrderEventStore;
import com.shop.platform.trade.mapper.OrderGroupStore;
import com.shop.platform.trade.mapper.OrderLineStore;
import com.shop.platform.trade.mapper.SellerOrderStore;
import com.shop.platform.trade.model.CloseReason;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * 落单。整条链路在一个事务里，任何一步失败就整单回滚。
 *
 * <p>顺序不能换：<b>校验报价 → 定好子单 id → 占库存 → 插三层订单 → 发事件</b>。
 *
 * <ul>
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

    private final PricingQuery pricing;
    private final InventoryCommand inventory;
    private final OrderGroupStore groups;
    private final SellerOrderStore sellerOrders;
    private final OrderLineStore lines;
    private final OrderEventStore events;
    private final ApplicationEventPublisher publisher;
    private final ObjectMapper json = JsonMapper.builder().build();

    public TradeService(
            PricingQuery pricing,
            InventoryCommand inventory,
            OrderGroupStore groups,
            SellerOrderStore sellerOrders,
            OrderLineStore lines,
            OrderEventStore events,
            ApplicationEventPublisher publisher) {
        this.pricing = Objects.requireNonNull(pricing, "pricing");
        this.inventory = Objects.requireNonNull(inventory, "inventory");
        this.groups = Objects.requireNonNull(groups, "groups");
        this.sellerOrders = Objects.requireNonNull(sellerOrders, "sellerOrders");
        this.lines = Objects.requireNonNull(lines, "lines");
        this.events = Objects.requireNonNull(events, "events");
        this.publisher = Objects.requireNonNull(publisher, "publisher");
    }

    @Override
    @Transactional
    public PlacedOrder placeOrder(PlaceOrderRequest request) {
        // 1. 校验报价（并 CAS 置 used）。不一致就 PRICE_CHANGED，什么都不写
        QuoteSnapshot quote = pricing.consumeForOrder(request.quoteId(), toPricingRequest(request));

        UUID groupId = Ids.newId();
        Instant expireAt = Instant.now().plus(TTL);
        String addressJson = writeJson(request.shipAddress());

        // 2. 按商家分组，先把子单 id 全部定下来——预占的幂等键要用它
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

        // 3. 占库存：按子单分组预占，幂等键 (seller_order_id, line_no) 才对得上
        List<ReserveRequest> reserveRequests = new ArrayList<>(byMerchant.size());
        for (Map.Entry<UUID, List<LineSnapshot>> entry : byMerchant.entrySet()) {
            UUID sellerOrderId = sellerOrderIdOf.get(entry.getKey());
            reserveRequests.add(new ReserveRequest(
                    groupId,
                    sellerOrderId,
                    entry.getValue().stream()
                            .map(line -> new ReserveRequest.Line(
                                    line.skuId(), line.merchantId(), line.lineNo(), line.quantity()))
                            .toList(),
                    expireAt));
        }
        // 不够卖时这里抛 INSUFFICIENT_STOCK，整个事务回滚——包括刚才的报价 CAS
        reserveRequests.forEach(inventory::reserve);

        // 4. 插订单组
        long shippingTotal = quote.shippingByShop().stream()
                .mapToLong(item -> item.amount().amount())
                .sum();
        groups.insert(new OrderGroupStore.NewGroup(
                groupId,
                BizNo.of("PO", LocalDate.now(ZoneId.systemDefault())),
                request.buyerId(),
                request.quoteId(),
                quote.currency(),
                quote.goods().amount(),
                quote.discount().amount(),
                shippingTotal,
                quote.payable().amount(),
                addressJson,
                expireAt));

        // 5. 插子单 + 行 + 分摊
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

        // 6. 发事件：与业务数据同事务落 outbox
        pending.forEach(publisher::publishEvent);

        return new PlacedOrder(
                groupId,
                groups.find(groupId).orElseThrow().groupNo(),
                List.copyOf(sellerOrderIdOf.values()),
                quote.payable(),
                expireAt);
    }

    @Override
    @Transactional
    public boolean cancelUnpaid(UUID orderGroupId, UUID buyerId) {
        OrderGroupStore.GroupRow group =
                groups.find(orderGroupId).orElseThrow(() -> BusinessException.notFound("订单不存在: " + orderGroupId));
        if (!group.buyerId().equals(buyerId)) {
            throw BusinessException.forbidden("只能取消自己的订单");
        }

        // 取消整单要写两个维度：先子单、再组，同一事务。
        // 只写组的话子单还开着，买家页和商家页会显示两个状态
        List<SellerOrderStore.SellerOrderRow> sellerOrdersOfGroup = sellerOrders.findByGroup(orderGroupId);

        if (!groups.close(orderGroupId, CloseReason.BUYER_CANCELLED)) {
            // 已经被支付回调或超时任务抢先，什么都没改
            return false;
        }
        for (SellerOrderStore.SellerOrderRow sellerOrder : sellerOrdersOfGroup) {
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
        List<SellerOrderStore.SellerOrderRow> sellerOrdersOfGroup = sellerOrders.findByGroup(orderGroupId);

        // 与支付回调用同一个前置条件，谁改到行谁赢
        if (!groups.close(orderGroupId, CloseReason.TIMEOUT)) {
            return false;
        }
        for (SellerOrderStore.SellerOrderRow sellerOrder : sellerOrdersOfGroup) {
            sellerOrders.close(sellerOrder.id(), CloseReason.TIMEOUT);
        }
        releaseReservations(sellerOrdersOfGroup);

        recordEvent(orderGroupId, "close", "unpaid", "timeout", "system", null, "超时关单");
        return true;
    }

    /**
     * 释放本次取消涉及的所有预占。
     *
     * <p>按 {@code (seller_order_id, line_no)} 逐行释放：这是库存的幂等键，也是它唯一认的粒度。
     * 预占已经被兜底扫描放掉时，release 自己是幂等的，不会多放。
     */
    private void releaseReservations(List<SellerOrderStore.SellerOrderRow> sellerOrdersOfGroup) {
        for (SellerOrderStore.SellerOrderRow sellerOrder : sellerOrdersOfGroup) {
            for (int lineNo : lines.lineNosOf(sellerOrder.id())) {
                inventory.release(sellerOrder.id(), lineNo);
            }
        }
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

        sellerOrders.insert(new SellerOrderStore.NewSellerOrder(
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

        for (LineSnapshot line : merchantLines) {
            UUID orderLineId = insertLine(sellerOrderId, line, quote);
            for (DiscountSnapshot item : line.discounts()) {
                lines.insertDiscount(
                        orderLineId,
                        new OrderLineStore.NewDiscount(
                                item.ruleId(),
                                item.ruleVersion(),
                                item.type(),
                                item.bearer(),
                                quote.currency(),
                                item.amount().amount()));
            }
        }

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
                                line.payable().amount()))
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
    private UUID insertLine(UUID sellerOrderId, LineSnapshot line, QuoteSnapshot quote) {
        UUID orderLineId = Ids.newId();
        lines.insert(new OrderLineStore.NewLine(
                orderLineId,
                sellerOrderId,
                line.lineNo(),
                line.offerId(),
                line.skuId(),
                line.spuId(),
                quote.currency(),
                line.quantity(),
                line.unitAmount().amount(),
                line.subtotal().amount(),
                line.discountAmount().amount(),
                line.payable().amount(),
                line.title(),
                line.imageUrl(),
                line.specValuesJson() == null ? "{}" : line.specValuesJson(),
                line.categoryId(),
                line.brandId(),
                line.identityKey(),
                // 费率与版本归 trust，这一版还没接；先落 0 + 版本号占位，等 trust 的 commission 接口
                0,
                "v1"));
        return orderLineId;
    }

    /**
     * 拼出 pricing 的输入形状。
     *
     * <p>行号、数量、商家都要与算价时一致，否则 fingerprint 对不上，用户会被莫名要求重新确认——
     * 所以这里只搬运，不做任何"优化"。
     */
    private static PricingRequest toPricingRequest(PlaceOrderRequest request) {
        List<PricingRequest.Line> rows = request.lines().stream()
                .map(line -> new PricingRequest.Line(
                        line.lineNo(), line.offerId(), line.skuId(), line.merchantId(), line.quantity()))
                .toList();
        return new PricingRequest(
                request.buyerId(),
                new PricingRequest.Address(
                        request.shipAddress().provinceCode(),
                        request.shipAddress().cityCode(),
                        request.shipAddress().districtCode()),
                rows,
                List.of());
    }

    private void recordEvent(
            UUID groupId, String dimension, String from, String to, String actorType, UUID actorId, String reason) {
        events.append(
                "group:" + groupId + ":" + dimension + ":" + to,
                "group",
                groupId,
                dimension,
                from,
                to,
                actorType,
                actorId,
                reason);
    }

    private String writeJson(Object value) {
        return value == null ? "null" : json.writeValueAsString(value);
    }
}
