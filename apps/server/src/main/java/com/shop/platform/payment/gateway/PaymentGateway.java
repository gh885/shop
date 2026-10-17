package com.shop.platform.payment.gateway;

import com.shop.platform.common.Money;
import java.util.UUID;

/**
 * 支付网关端口 —— payment 模块与技术渠道（支付宝…）交互的唯一边界（新动作也只在这里加方法）。
 *
 * <p>今天的实现只有两个：{@link MockPaymentGateway}（V1 默认，无外部 IO）与
 * {@code infra.alipay.AlipayGateway}（沙箱 / 生产）。
 *
 * <p>约定：
 * <ul>
 *   <li>{@link #channel()} 的值就是 payment.channel 落库值。</li>
 *   <li>{@link #available()} 为 false 的渠道不参与装配；手动指定了不可用渠道时应用启动失败，
 *       不做「静默回落 MOCK」——那等于把钱的事降级成一句谎话。</li>
 *   <li>{@link #createTrade} 返回收银台跳转地址；{@code null} 表示该渠道不需要跳转（MOCK 的直接确认）。</li>
 *   <li>{@link #queryTrade} 是「这笔钱到底到没到」的唯一权威来源。确认 / 回调 / 补单都调它，
 *       调用方不许相信请求方声明的支付结果。</li>
 *   <li>{@link #refund} 是<b>提交</b>退款请求，返回渠道侧受理结果与渠道退款单号。
 *       受理 ≠ 完成：V1 MOCK 受理即完成；支付宝退款若异步，以查询结果为准。</li>
 *   <li>渠道侧失败：实现抛 {@link PaymentGatewayException}，交由调用方按其语义取舍。</li>
 * </ul>
 */
public interface PaymentGateway {

    /** 渠道标识（= payment.channel 落库值） */
    String channel();

    /** 是否可用（已配置且启用） */
    boolean available();

    /** 创建渠道侧交易，返回收银台跳转地址；null = 该渠道无需跳转 */
    String createTrade(TradeParams request);

    /** 查询一笔交易的真实状态：调用方据此决定能否推进订单 */
    TradeQueryResult queryTrade(String outTradeNo);

    /** 提交退款。调用方已按订单校验归属与金额，网关侧只做「把这笔钱退回去」。 */
    RefundOutcome refund(RefundParams request);

    record TradeParams(String outTradeNo, Money amount, String subject) {}

    /** 渠道侧交易状态：paid 为 true 时 gatewayTradeNo 是渠道交易号，用于对账与退款 */
    record TradeQueryResult(boolean paid, String gatewayTradeNo) {}

    record RefundParams(UUID paymentId, UUID orderId, String orderNo, Money amount, String reason) {}

    /** 渠道侧退款受理结果 */
    record RefundOutcome(String refundNo) {}
}
