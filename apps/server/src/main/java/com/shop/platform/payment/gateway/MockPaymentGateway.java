package com.shop.platform.payment.gateway;

import com.shop.platform.payment.mapper.Payment;
import org.springframework.stereotype.Component;

/**
 * V1 MOCK 渠道实现 —— 受理即完成、无外部 IO，只给本地流水生成一个渠道侧退款单号。
 * 接真实网关时新增 WechatGateway / AlipayGateway 等实现并切换注入，退款调用点不跟着改；
 * 但监听器的事务时机是另一件事（届时同步监听改 AFTER_COMMIT + outbox，见 payment/package-info）。
 */
@Component
public class MockPaymentGateway implements PaymentGateway {

    @Override
    public String channel() {
        return Payment.CHANNEL_MOCK;
    }

    @Override
    public RefundOutcome refund(RefundParams request) {
        // MOCK 受理即成功：渠道单号直接取本地流水 ID，无需真实退款
        return new RefundOutcome("MOCK-REFUND-" + request.paymentId());
    }
}
