package com.shop.platform.logistics.model;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Duration;
import java.util.Set;

/**
 * 物流异常类型 —— 一行一类：<b>包裹停在哪个状态、停了多久算异常</b>。
 *
 * <p>判据只有时间，不依赖承运商推"异常"状态：对方不推、推丢了都不会让我们漏掉卡住的包裹，
 * 阈值也能单独调整重扫（可离线复算）。
 *
 * <p>做成枚举表而不是三段扫描代码：三类的扫描与建单逻辑逐字相同，差异只有这三列，
 * 加第四类只加一行（与 order 模块的 {@code OrderTimeout} 同一手法）。
 */
@Schema(enumAsRef = true)
public enum ShipmentIssueType {

    /** 揽收超时：发货后承运商迟迟没取件 */
    PICKUP_TIMEOUT(Set.of(ShipmentStatus.PENDING_PICKUP), Duration.ofHours(24), "超过 24 小时未揽收"),

    /** 中转停滞：已经揽收但长时间没有新的中转节点 */
    TRANSIT_STALLED(Set.of(ShipmentStatus.PICKED_UP, ShipmentStatus.IN_TRANSIT), Duration.ofHours(48), "超过 48 小时无中转动态"),

    /** 派送停滞：已到末端网点但迟迟未派送成功 */
    DELIVERY_STALLED(Set.of(ShipmentStatus.DELIVERING), Duration.ofHours(24), "超过 24 小时未派送成功");

    private final Set<ShipmentStatus> fromStatuses;

    private final Duration threshold;

    private final String description;

    ShipmentIssueType(Set<ShipmentStatus> fromStatuses, Duration threshold, String description) {
        this.fromStatuses = fromStatuses;
        this.threshold = threshold;
        this.description = description;
    }

    /** 只有停在这些状态的包裹会被本类异常扫到 */
    public Set<ShipmentStatus> fromStatuses() {
        return fromStatuses;
    }

    /** 停滞阈值：最后一条动态（没有动态则发货时刻）早于 now 减此值即判异常 */
    public Duration threshold() {
        return threshold;
    }

    /** 人话描述（建单时写进 detail，客服可以直接念给买家听） */
    public String description() {
        return description;
    }
}
