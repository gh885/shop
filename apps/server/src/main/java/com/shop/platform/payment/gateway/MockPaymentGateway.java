package com.shop.platform.payment.gateway;

import com.shop.platform.payment.mapper.Payment;
import org.springframework.stereotype.Component;

/**
 * V1 MOCK 渠道实现 —— 受理即完成、无外部 IO，只给本地流水生成一个渠道侧退款单号。
 *
 * <p>MOCK 的「支付成功」由收银台的确认端点声明，没有渠道可查：{@link #createTrade} 返回 null
 * （不跳转），{@link #queryTrade} 恒为未支付。所以 MOCK 渠道的确认分支不走查询，
 * 那是 V1 的已知边界而非疏漏（见 {@code PaymentController} 类注释）。
 */
@Component
public class MockPaymentGateway implements PaymentGateway {

    @Override
    public String channel() {
        return Payment.CHANNEL_MOCK;
    }

    @Override
    public boolean available() {
        return true;
    }

    @Override
    public String createTrade(TradeParams request) {
        return null;
    }

    @Override
    public TradeQueryResult queryTrade(String outTradeNo) {
        return new TradeQueryResult(false, null);
    }

    @Override
    public RefundOutcome refund(RefundParams request) {
        // MOCK 受理即成功：渠道单号直接取本地流水 ID，无需真实退款
        return new RefundOutcome("MOCK-REFUND-" + request.paymentId());
    }
}
