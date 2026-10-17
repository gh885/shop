package com.shop.platform.logistics.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 归一化轨迹节点码 —— 承运商原始码在接入边界翻译成它之后即丢弃，领域层只见标准词表。
 *
 * <p>多个节点码可映射到同一阶段（到达/离开分拨都算运输中），这是刻意为之：轨迹要细，阶段要粗。
 * 节点码只服务两件事：<b>展示</b>（{@link TrackingStage} 时间轴分段）与<b>触发</b>
 * （签收 / 退回 / 已动身三类事实，见 {@link #moved()}）。包裹的履约状态不从这里推导，
 * 它的真相是时间戳（{@link ShipmentStatus}）。
 *
 * <p>DB 列存 {@code name()}（varchar）。
 */
@Schema(enumAsRef = true)
public enum TrackingNodeCode {

    /** 揽收成功 */
    PICKED_UP(TrackingStage.PICKED_UP),

    /** 到达分拨中心 */
    ARRIVED_HUB(TrackingStage.IN_TRANSIT),

    /** 离开分拨中心 */
    DEPARTED_HUB(TrackingStage.IN_TRANSIT),

    /** 派件员领件（派送中） */
    OUT_FOR_DELIVERY(TrackingStage.DELIVERING),

    /** 签收成功 */
    DELIVERED(TrackingStage.DELIVERED),

    /** 退回寄件方 */
    RETURNED(TrackingStage.RETURNED),

    /** 异常（滞留 / 拒收 / 破损等） */
    EXCEPTION(TrackingStage.EXCEPTION);

    private final TrackingStage stage;

    TrackingNodeCode(TrackingStage stage) {
        this.stage = stage;
    }

    /** 本节点在时间轴上的阶段：展示分段与异常扫描用，不参与履约状态推导 */
    public TrackingStage stage() {
        return stage;
    }

    /**
     * 这条节点是否证明货已经离开卖家：揽收、中转动静、派送、签收、退回都算，异常不算
     * （滞留可能发生在交寄之前）。待发货的包裹收到这类节点时自动转已发出。
     */
    public boolean moved() {
        return this != EXCEPTION;
    }
}
