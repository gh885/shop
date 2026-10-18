package com.shop.platform.payment.api;

import com.shop.platform.common.Money;
import java.util.UUID;

/**
 * 一次渠道退款请求：按<b>订单</b>定位该单的成功支付流水，按<b>退款单号</b>做渠道幂等键。
 *
 * <p>为什么用订单而不是支付流水 ID：aftersale 只认业务归属（退款单挂在订单上），支付流水是 payment 内部
 * 的实现细节。为什么带退款单号：渠道侧的 {@code out_request_no} 必须是稳定的幂等键——同一张退款单被重试时
 * 渠道应当识别为同一笔，而不是退第二次。重试只追加执行记录、不改退款单状态（§4.5），幂等键因此必须来自退款单。
 */
public record PaymentRefund(UUID orderId, String refundNo, Money amount, String reason) {}
