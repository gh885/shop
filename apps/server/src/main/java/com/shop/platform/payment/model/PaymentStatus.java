package com.shop.platform.payment.model;

/**
 * 支付流水状态机：PENDING → SUCCESS → REFUNDED（或 FAILED）。V1 双段式（发起 + 确认）。
 *
 * <p>DB 存 {@code name()}（varchar）。资金态唯一真相在流水行；订单侧只记「退多少」，不重复定义状态。
 */
public enum PaymentStatus {

    /** 待支付（发起创建，未确认） */
    PENDING,

    /** 支付成功（已推进订单） */
    SUCCESS,

    /** 失败 / 关闭 */
    FAILED,

    /** 已退款（终态）：已付款订单取消时由 SUCCESS 转入 */
    REFUNDED;

    public boolean isSuccess() {
        return this == SUCCESS;
    }
}
