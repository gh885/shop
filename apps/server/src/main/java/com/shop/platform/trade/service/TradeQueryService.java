package com.shop.platform.trade.service;

import com.shop.platform.trade.api.TradeQuery;
import com.shop.platform.trade.mapper.OrderGroupMapper;
import com.shop.platform.trade.mapper.OrderLineMapper;
import com.shop.platform.trade.mapper.SellerOrderMapper;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** {@link TradeQuery} 的实现。只读，不开事务。 */
@Component
public class TradeQueryService implements TradeQuery {

    private final OrderGroupMapper groups;
    private final SellerOrderMapper sellerOrders;
    private final OrderLineMapper lines;

    public TradeQueryService(OrderGroupMapper groups, SellerOrderMapper sellerOrders, OrderLineMapper lines) {
        this.groups = Objects.requireNonNull(groups, "groups");
        this.sellerOrders = Objects.requireNonNull(sellerOrders, "sellerOrders");
        this.lines = Objects.requireNonNull(lines, "lines");
    }

    @Override
    public Optional<Payable> findPayable(UUID orderGroupId) {
        return groups.findInternal(orderGroupId)
                .map(group -> new Payable(
                        group.id(),
                        group.buyerId(),
                        group.payableAmount(),
                        group.currency(),
                        // 还能付：未付款、未关闭、未过期。三个条件缺一不可
                        group.paymentStatus() == com.shop.platform.trade.model.PaymentStatus.UNPAID
                                && group.isOpen()
                                && group.expiresAt().isAfter(java.time.Instant.now()),
                        group.paymentStatus().hasMoney(),
                        group.expiresAt()));
    }

    /**
     * 可发货形状。
     *
     * <p>{@code remaining} 在这里算，不让调用方自己减：超发就是超卖，而"算剩下的"这件事
     * 只有持有计数器的 trade 能做对。
     *
     * <p>{@code paid} 从订单组读，不从子单读——支付在 group 上，子单没有支付状态。
     */
    @Override
    public Optional<Shippable> findShippable(UUID sellerOrderId) {
        return sellerOrders.findInternal(sellerOrderId).flatMap(sellerOrder -> groups.findInternal(
                        sellerOrder.groupId())
                .map(group -> new Shippable(
                        sellerOrder.id(),
                        sellerOrder.groupId(),
                        sellerOrder.merchantId(),
                        sellerOrder.currency(),
                        group.paymentStatus().hasMoney(),
                        !group.isOpen() || sellerOrder.closedAt() != null,
                        sellerOrder.fulfillmentStatus(),
                        lines.findShippable(sellerOrderId))));
    }

    /**
     * 售后要的一行事实。
     *
     * <p>{@code payableAmount} 是<b>实付</b>（已扣优惠分摊），退款上限就是它——不是 {@code subtotal}。
     * 按原价算就会退多，这是售后最典型的一个错。
     */
    @Override
    public Optional<RefundableLine> findRefundable(UUID orderLineId) {
        return lines.findRefundable(orderLineId);
    }

    @Override
    public Optional<RefundableLine> findRefundable(UUID sellerOrderId, int lineNo) {
        return lines.findRefundable(sellerOrderId, lineNo);
    }
}
