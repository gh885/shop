package com.shop.platform.payment.gateway;

import com.shop.platform.common.Money;
import java.util.UUID;

/**
 * 支付网关端口 —— payment 模块与技术渠道（微信/支付宝…）交互的唯一边界，V1 由
 * {@link MockPaymentGateway} 支撑。渠道侧的一切异同（下单、验签、退款、对账）都被挡在这里，
 * service / listener 只面对本地流水与这个薄端口，换真实网关 = 换一个实现，模块内部逻辑零改动。
 *
 * <p><b>只抽象「现在真实存在的动作」</b>：退款（V1 已触发，且必须触达外部）。发起/回调验签的
 * 入参出参形状要等接真实网关才成立，届时随那个 PR 一并加，不预先定型。
 *
 * <p>约定：
 * <ul>
 *   <li>{@link #channel()} 的值就是 payment.channel 落库值。</li>
 *   <li>{@link #refund(RefundParams)} 是<b>提交</b>退款请求，返回渠道侧受理结果与渠道退款单号。
 *       受理 ≠ 完成：V1 MOCK 受理即完成；接真实网关若退款结果异步（微信退款是回调通知），
 *       则「本地流水置 REFUNDED」的时机应移到退款结果回调，本端口方法只负责提交，
 *       两个消费方共享同一端口不冲突。</li>
 *   <li>渠道侧失败：实现抛 {@link PaymentGatewayException}，交由调用方按其语义取舍
 *       （取消场景放行人工对账、售后场景回滚）。</li>
 * </ul>
 */
public interface PaymentGateway {

    /** 渠道标识（= payment.channel 落库值） */
    String channel();

    /** 提交退款。调用方已按订单校验归属与金额，网关侧只做「把这笔钱退回去」。 */
    RefundOutcome refund(RefundParams request);

    record RefundParams(UUID paymentId, UUID orderId, String orderNo, Money amount, String reason) {}

    /** 渠道侧退款受理结果 */
    record RefundOutcome(String refundNo) {}
}
