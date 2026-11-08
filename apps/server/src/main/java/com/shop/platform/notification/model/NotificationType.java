package com.shop.platform.notification.model;

import java.util.Locale;

/**
 * 站内信种类。每种对应一个上游事实事件，前端按它选 i18n 模板——后端不存文案，
 * 加一种消息 = 加一个枚举值 + 一个监听方法 + 前端一份模板。
 */
public enum NotificationType {
    /** 商家：新订单待发货（SellerOrderPlaced）。 */
    ORDER_PLACED,
    /** 买家：包裹已发货（ShipmentRecorded）。 */
    SHIPMENT_RECORDED,
    /** 买家：退款已到账（RefundSucceeded）。 */
    REFUND_SUCCEEDED,
    /** 买家：订单完成，可评价（OrderCompleted）。 */
    ORDER_COMPLETED,
    /** 商家：店铺被平台暂停（SellerSuspended）。 */
    SELLER_SUSPENDED,
    /** 商家：店铺恢复经营（SellerResumed）。 */
    SELLER_RESUMED;

    public String dbValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static NotificationType from(String value) {
        return valueOf(value.toUpperCase(Locale.ROOT));
    }
}
