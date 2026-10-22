package com.shop.platform.payment.internal;

import java.util.Map;

/**
 * 支付渠道的适配口。**唯一的渠道耦合点。**
 *
 * <p>存在的理由：业务状态机（幂等、超时、金额校验）和渠道协议（签名、报文、SDK）是两件事，
 * 混在一起调试时，回调不来你分不清是状态机错了还是签名错了。
 *
 * <p>三个实现：
 *
 * <ul>
 *   <li>{@link MockChannel} —— 本地调试，签什么都是对的，用来跑通"下单 → 支付 → 发货"
 *   <li>{@link AlipayChannel} —— 支付宝开放平台，**不引 SDK**，用 JDK 的 {@code Signature} 做 RSA2
 *   <li>以后接微信、银联各加一个
 * </ul>
 *
 * <p>放在 {@code internal}：外部模块（包括 trade）不该知道渠道长什么样，它只认 {@code PaymentSucceeded}。
 */
public interface PaymentChannel {

    /** 渠道标识，落 {@code payment_order.channel}。 */
    String code();

    /**
     * 发起支付，返回给前端的跳转地址或表单。
     *
     * @return 空 = 这个渠道不需要跳转（例如 mock 直接成功）
     */
    String createPayment(Charge charge);

    /**
     * 验证并解析回调。
     *
     * @param rawParams 渠道 POST 上来的原始表单
     * @return 解析后的事实；**签名不过就往死里拒**，不要"宽松放行"
     * @throws InvalidCallbackException 签名或格式不对
     */
    CallbackResult parseCallback(Map<String, String> rawParams);

    /**
     * 主动查单。用户说付了但回调没来时的唯一出路。
     *
     * @return 查到的状态；查不到返回 {@code null}
     */
    CallbackResult query(String outTradeNo);

    record Charge(String outTradeNo, long amount, String subject, String notifyUrl, String returnUrl) {}

    /**
     * 渠道告诉我们的事实。
     *
     * @param success 是否支付成功
     * @param amount 渠道报的金额（分）。**必须和订单应付比对**，不一致不能当成功
     * @param channelTxnId 渠道流水号，重放靠它挡
     */
    record CallbackResult(String outTradeNo, boolean success, long amount, String channelTxnId, String rawPayload) {}

    class InvalidCallbackException extends RuntimeException {

        public InvalidCallbackException(String message) {
            super(message);
        }
    }
}
