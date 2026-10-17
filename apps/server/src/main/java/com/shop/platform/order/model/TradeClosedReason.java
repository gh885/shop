package com.shop.platform.order.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 主订单关单原因 —— {@code status = CLOSED} 时必填的事实（DB CHECK 钉住），
 * 与子订单的 {@code cancel_reason} 同词表（docs/domain/order-model.md §4.1）。
 */
@Schema(enumAsRef = true)
public enum TradeClosedReason {

    /** 买家取消 */
    BUYER_CANCELLED,

    /** 超时未支付 */
    PAY_TIMEOUT,

    /** 全部子订单终态且已全额退款（§8 主订单全额退款关单） */
    FULL_REFUND,

    /** 平台关闭 */
    PLATFORM_CLOSED
}
