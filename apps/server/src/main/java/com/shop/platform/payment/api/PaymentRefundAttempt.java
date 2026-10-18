package com.shop.platform.payment.api;

/**
 * 渠道退款的一次尝试结果。失败不抛异常：退款单要把每一次调用都落成 {@code RefundExecution}，
 * 由它自己的重试线决定「再试一次」还是转人工（§8）。真正无法继续的（查无支付流水、金额超限）仍抛 409。
 *
 * @param success         渠道是否受理/确认成功
 * @param gatewayRefundNo 渠道侧退款单号（成功时回填）
 * @param errorMessage    失败原因（成功时为 null）
 */
public record PaymentRefundAttempt(boolean success, String gatewayRefundNo, String errorMessage) {}
