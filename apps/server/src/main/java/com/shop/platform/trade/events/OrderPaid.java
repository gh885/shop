package com.shop.platform.trade.events;

import com.shop.platform.common.event.DomainEvent;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 支付成功，订单进入待发货。
 *
 * <p>与 {@code PaymentSucceeded} 的分工：那个是"渠道说钱到了"，这个是"trade 确认这单该发货了"。
 * 两者之间隔着金额校验和 CAS——金额不符时 {@code PaymentSucceeded} 到了但 {@code OrderPaid} 不发。
 *
 * <p>带 {@code sellerOrders} 是因为下游按子单行动：{@code fulfillment} 要给每个子单建一条发货任务，
 * 一个订单组拆成三个子单就有三条任务、三个不同的承诺发货时间。
 */
public record OrderPaid(
        UUID eventId,
        UUID orderGroupId,
        UUID paymentId,
        long paidAmount,
        String currency,
        List<SellerOrderRef> sellerOrders,
        Instant paidAt)
        implements DomainEvent {

    public OrderPaid {
        sellerOrders = List.copyOf(sellerOrders);
    }

    /**
     * @param shopId 发货任务按店铺统计时效，所以它要跟着走
     * @param goodsAmount 商品款（不含运费），佣金按它算
     * @param payableAmount 子单应付（含运费），商家的待结算基数
     *
     *     <p>金额必须随事件走：{@code clearing} 不能回查 {@code trade}（那会成环），
     *     拿不到金额就只能记一笔糊涂账。
     */
    public record SellerOrderRef(
            UUID sellerOrderId, UUID merchantId, UUID shopId, long goodsAmount, long payableAmount) {}
}
