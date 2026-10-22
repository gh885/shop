package com.shop.platform.trade.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.payment.api.PaymentCommand;
import com.shop.platform.payment.api.PaymentView;
import com.shop.platform.trade.api.TradeQuery;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * 发起支付的编排。
 *
 * <p><b>为什么这个类在 trade 而不在 payment。</b> 发起支付要先知道"该付多少"，
 * 而应付金额只有订单的持有者 trade 知道。如果让 payment 回查 trade，
 * {@code payment → trade.api} 加上 {@code trade → payment.events} 就是一个真环——
 * 而环一旦存在，两个模块就再也分不开了。
 *
 * <p>所以分工是：trade 算金额并校验归属，payment 只管"收钱"。
 * 依赖方向单向 {@code trade → payment :: api}。
 *
 * <p>这不违反"金额不许前端传"：买家侧入口 {@code POST /api/orders/{id}/pay} 只收订单组 id，
 * 金额在这里由 {@link TradeQuery#findPayable} 从订单读出来。
 */
@Component
public class PaymentStarter {

    private final TradeQuery trades;

    private final PaymentCommand payments;

    public PaymentStarter(TradeQuery trades, PaymentCommand payments) {
        this.trades = Objects.requireNonNull(trades, "trades");
        this.payments = Objects.requireNonNull(payments, "payments");
    }

    /**
     * 给这一单发起支付。
     *
     * <p>三条校验的顺序是有意的：先确认订单存在（404），再确认是不是你的（404 而不是 403——
     * 403 会告诉调用方"这个 id 确实存在"），最后确认还能不能付（409）。
     */
    public PaymentView start(UUID orderGroupId, UUID buyerId) {
        TradeQuery.Payable payable = trades.findPayable(orderGroupId)
                .orElseThrow(() -> BusinessException.notFound("订单不存在: " + orderGroupId));

        if (!payable.buyerId().equals(buyerId)) {
            throw BusinessException.notFound("订单不存在: " + orderGroupId);
        }
        if (!payable.payableNow()) {
            throw BusinessException.conflict("订单已关闭或已支付，不能再次发起支付: " + orderGroupId);
        }

        return payments.create(orderGroupId, buyerId, payable.payableAmount(), payable.currency());
    }
}
