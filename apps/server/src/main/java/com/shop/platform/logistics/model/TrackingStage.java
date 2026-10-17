package com.shop.platform.logistics.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 轨迹节点的粗粒度阶段 —— <b>只服务展示</b>（买家时间轴分段、异常扫描判停滞）。
 *
 * <p>和 {@link ShipmentStatus} 是两条轴：包裹履约只有四态（待发货/已发出/已签收/已取消），
 * 而一条轨迹可以说得更细（已揽件、到达分拨、派送中）。把两者混成一个枚举，结果是包裹状态被
 * 承运商的推送节奏牵着走；分开之后，节点码 → 阶段只是展示投影，改词表不影响履约。
 *
 * <p>节点码 → 阶段的映射唯一入口是 {@link TrackingNodeCode#stage()}。
 */
@Schema(enumAsRef = true)
public enum TrackingStage {

    /** 已揽件（包裹进入承运网络） */
    PICKED_UP,

    /** 运输中（分拨中心进出、干线转运） */
    IN_TRANSIT,

    /** 派送中（已到末端网点，派件员领件） */
    DELIVERING,

    /** 已签收 */
    DELIVERED,

    /** 已退回寄件方 */
    RETURNED,

    /** 异常（滞留 / 拒收 / 破损等） */
    EXCEPTION
}
