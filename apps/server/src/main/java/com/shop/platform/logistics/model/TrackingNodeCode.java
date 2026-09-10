package com.shop.platform.logistics.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 归一化轨迹节点码 —— <b>节点码 → 状态 映射的唯一真相</b>。
 *
 * <p>承运商各说各话（顺丰 200 / 中通 5 / 圆通 SIGNED），原始状态码在接入边界翻译成本枚举后即丢弃，
 * 领域层只见标准词表；轨迹表只存本枚举的 {@code name()}，承运商原始描述另存 {@code description} 供展示。
 * 三期接真实承运商时只换翻译层，状态推进逻辑一行不改。
 *
 * <p>多个节点码可映射到同一状态（到达/离开分拨都算运输中），这是刻意为之：轨迹要细，状态要粗。
 *
 * <p>DB 列存 {@code name()}（varchar）。
 */
@Schema(enumAsRef = true)
public enum TrackingNodeCode {

    /** 揽收成功 */
    PICKED_UP(ShipmentStatus.PICKED_UP),

    /** 到达分拨中心 */
    ARRIVED_HUB(ShipmentStatus.IN_TRANSIT),

    /** 离开分拨中心 */
    DEPARTED_HUB(ShipmentStatus.IN_TRANSIT),

    /** 派件员领件（派送中） */
    OUT_FOR_DELIVERY(ShipmentStatus.DELIVERING),

    /** 签收成功 */
    DELIVERED(ShipmentStatus.DELIVERED),

    /** 退回寄件方 */
    RETURNED(ShipmentStatus.RETURNED),

    /** 异常（滞留 / 拒收 / 破损等） */
    EXCEPTION(ShipmentStatus.EXCEPTION);

    private final ShipmentStatus status;

    TrackingNodeCode(ShipmentStatus status) {
        this.status = status;
    }

    /** 本节点推导出的包裹状态：状态是轨迹的投影，这是唯一的推导入口 */
    public ShipmentStatus status() {
        return status;
    }
}
