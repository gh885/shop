package com.shop.platform.payment.api;

import java.util.Locale;

/**
 * 挂账原因。"钱到了但订单推进不了"的三种情况，全部收敛到 {@code payment.suspense_entry}：
 * 之前它们是三处各写各的日志——而日志是没人会去看的东西。
 *
 * <p>谁写入：{@code LATE_CALLBACK} 与 {@code AMOUNT_MISMATCH} 由 payment 在回调路径落，
 * {@code ORDER_CLOSED} 由 trade 的 PaymentSucceededHandler 在 markPaid 输给关单后经
 * {@code PaymentCommand.suspend} 落（依赖方向 trade → payment :: api，与发起支付同向）。
 */
public enum SuspenseReason {
    /** 支付单已关/已失败后渠道才报成功——迟到回调，钱在渠道手里。 */
    LATE_CALLBACK,
    /** 钱到了但金额和应付对不上。 */
    AMOUNT_MISMATCH,
    /** 支付成功但订单已被超时关单或买家取消，markPaid 输了。 */
    ORDER_CLOSED;

    public String dbValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static SuspenseReason from(String value) {
        return valueOf(value.toUpperCase(Locale.ROOT));
    }
}
