package com.shop.platform.logistics.model;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * 包裹状态机 —— 由轨迹节点推导出来的<b>投影</b>，不是独立写入的状态。
 *
 * <p><b>单调性</b>：每态一个 {@link #rank()}，只允许 rank 前进；{@link #sourcesOf} 反推合法前态给条件更新
 * （{@code WHERE status IN (...)}），与 {@code OrderStatus.sourcesOf} 同一套路，正确性不依赖加锁。
 * 理由是承运商的推送乱序、迟到、重推是必然：<b>已签收不可能被后来的「运输中」覆盖</b>，
 * 迟到的旧节点只落库不改状态。
 *
 * <p>{@link #EXCEPTION} 是过程态而非分支（滞留/拒收后仍可能继续派送或签收），rank 记为 0 且始终留在
 * 各前向状态的合法前态集里——否则包裹一次异常就永远卡死。终态（DELIVERED / RETURNED）rank 最大，
 * 没有更大的目标态可达，故天然不可回退。
 *
 * <p>DB 列存 {@code name()}（varchar + 默认 EnumTypeHandler），CHECK 约束与取值同步（迁移 V50）。
 */
@Schema(enumAsRef = true)
public enum ShipmentStatus {

    /** 待揽收（发货已落包裹，承运商尚未取件） */
    PENDING_PICKUP(10),

    /** 已揽收（包裹进入承运网络） */
    PICKED_UP(20),

    /** 运输中（分拨中心进出、干线转运） */
    IN_TRANSIT(30),

    /** 派送中（已到末端网点，派件员领件） */
    DELIVERING(40),

    /** 已签收（正向终态） */
    DELIVERED(50),

    /** 已退回（派送失败退回寄件方，终态） */
    RETURNED(60),

    /** 异常（滞留 / 拒收 / 退回处理中）；不参与前进比较，可被任意前向状态离开 */
    EXCEPTION(0);

    private final int rank;

    ShipmentStatus(int rank) {
        this.rank = rank;
    }

    /** 单调性量级；EXCEPTION 为 0（不参与前进比较） */
    public int rank() {
        return rank;
    }

    /**
     * 目标态 → 合法前态集（条件更新的闸门依据）：rank 小于目标的全部状态，外加 EXCEPTION
     * （异常可被任意前向状态离开）。
     *
     * <p>常量在枚举初始化期算一次：每次推进都查表，不做扫描。
     */
    private static final Map<ShipmentStatus, Set<ShipmentStatus>> SOURCES = Arrays.stream(values())
            .collect(java.util.stream.Collectors.toUnmodifiableMap(status -> status, ShipmentStatus::computeSources));

    /** 能推进到 target 的全部前态：全部非终态（rank 更小者）+ EXCEPTION */
    private static Set<ShipmentStatus> computeSources(ShipmentStatus target) {
        Set<ShipmentStatus> sources = new HashSet<>();
        // EXCEPTION 是过程态：它既是任意前向目标的合法前态（异常处理完继续派送），
        // 也接受任意非终态进入（滞留/拒收只可能发生在在途过程中）
        sources.add(EXCEPTION);
        for (ShipmentStatus candidate : values()) {
            if (candidate.rank <= 0 || candidate.rank > DELIVERING.rank) {
                continue; // 排除 EXCEPTION 自身（已加入）与两个终态（签收/退回之后没有更后的事实）
            }
            if (target == EXCEPTION || candidate.rank < target.rank) {
                sources.add(candidate);
            }
        }
        return Set.copyOf(sources);
    }

    /** 能推进到 target 的全部前态；条件更新（{@code WHERE status IN (...)}）的合法前置集 */
    public static Set<ShipmentStatus> sourcesOf(ShipmentStatus target) {
        return SOURCES.getOrDefault(target, Set.of());
    }

    /** 是否终态（包裹走完或退回）：终态意味着"不需要再等动静了"，轮询与异常扫描都据此放过它 */
    public boolean terminal() {
        return this == DELIVERED || this == RETURNED;
    }
}
