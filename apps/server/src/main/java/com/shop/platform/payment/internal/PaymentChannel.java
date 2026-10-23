package com.shop.platform.payment.internal;

import com.shop.platform.common.BusinessException;
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

    /**
     * 发起退款。
     *
     * <p>默认不支持：不是所有渠道都能原路退回，而且能退的渠道签名/报文各不相同。
     * 不支持的渠道直接抛，让上层把退款单留在 {@code pending} 等人工——**不要假装成功**，
     * 那会让售后单直接走到"已完成"，而钱根本没出去。
     */
    default RefundResult refund(Refund refund) {
        throw new UnsupportedOperationException("渠道 " + code() + " 不支持退款");
    }

    /**
     * @param outRefundNo 我方退款单号，渠道幂等用它
     * @param outTradeNo 原支付单号
     * @param amount 退款金额（分）
     */
    record Refund(String outRefundNo, String outTradeNo, long amount) {}

    /**
     * @param success 渠道是否受理成功
     * @param channelRefundId 渠道退款流水号
     */
    record RefundResult(boolean success, String channelRefundId, String rawPayload) {}

    /**
     * 一次收银台请求。{@code expiresAt} 会作为 {@code time_expire} 传给渠道——渠道自己也拒收
     * 晚付款，和我们这边的关单互为双保险：只关自己的门，渠道的门还开着，钱照样能付进来。
     * 回调/回跳地址不在这里：那是渠道级配置，通道构造时注入，不随每一单变。
     */
    record Charge(String outTradeNo, long amount, String subject, java.time.Instant expiresAt) {}

    /**
     * 渠道告诉我们的事实。
     *
     * @param success 是否支付成功
     * @param amount 渠道报的金额（分）。**必须和订单应付比对**，不一致不能当成功
     * @param channelTxnId 渠道流水号，重放靠它挡
     */
    record CallbackResult(String outTradeNo, boolean success, long amount, String channelTxnId, String rawPayload) {}

    /**
     * 渠道报文不合法：签名对不上、缺字段、金额解析不了。
     *
     * <p><b>继承 {@link BusinessException} 是为了让 400 自己成立。</b> 它原来是裸的
     * {@code RuntimeException}，没有任何 handler 接，一路落进 {@code Exception} 兜底变成 500——
     * 渠道明明只是签名对不上，我们却回「服务器内部错误」，监控上多一条假故障。
     *
     * <p>为什么不给 {@code GlobalExceptionHandler} 单独加一个 {@code @ExceptionHandler}：
     * 那个类住在 {@code infra}，而 {@code infra} 是共享包，不该认识 {@code payment} 这个业务模块。
     * 让异常继承 {@code common} 里的基类，{@code infra} 一行都不用改。
     *
     * <p>对外文案固定，不带具体原因：验签失败的原因是给攻击者的提示
     * （"缺 sign" 和 "签名错" 是两条不同的探测路径），只写日志。
     */
    class InvalidCallbackException extends BusinessException {

        /** 给日志看的原因，不进响应。 */
        private final String technicalReason;

        public InvalidCallbackException(String message) {
            super(400, "支付回调报文不合法");
            this.technicalReason = message;
        }

        public String getTechnicalReason() {
            return technicalReason;
        }
    }
}
