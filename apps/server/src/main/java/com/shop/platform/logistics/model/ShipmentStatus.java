package com.shop.platform.logistics.model;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 包裹履约状态机 —— 「这批货走到哪」，与轨迹节点解耦。
 *
 * <p>词表（docs/domain/order-model.md §4.4 / §5.2）：待发货 → 已发出 → 已签收，旁支 已取消。
 * 状态是<b>时间戳的镜像</b>而不是轨迹的投影：{@code shipped_at} 非空即已发出，{@code signed_at}
 * 非空即已签收，{@code cancelled_at} 非空即已取消。轨迹节点是展示用的历史流水（见
 * {@link TrackingStage}），乱序、迟到、重推只影响时间轴，不再能改写包裹状态。
 *
 * <p>转移表是唯一真相：{@link #sourcesOf} 供条件更新反推合法前态，{@link #terminal()} 给轮询与异常
 * 扫描判「不用再等动静」。
 *
 * <p>DB 列存 {@code name()}（varchar + 默认 EnumTypeHandler），CHECK 与取值同步（迁移 V83）。
 */
@Schema(enumAsRef = true)
public enum ShipmentStatus {

    /** 待发货：包裹单已录（承运商 + 运单号），货还没交出去；不占订单行的有效发货量 */
    PENDING_DISPATCH,

    /** 已发出：货已交承运商，累计发出量从这一刻起算 */
    DISPATCHED,

    /** 已签收（正向终态） */
    DELIVERED,

    /** 已取消：待发货单取消只释放名额，已发出单取消回退有效发货量；已签收不可取消 */
    CANCELLED;

    private static final Map<ShipmentStatus, Set<ShipmentStatus>> TRANSITIONS = Map.of(
            PENDING_DISPATCH, Set.of(DISPATCHED, CANCELLED),
            DISPATCHED, Set.of(DELIVERED, CANCELLED),
            DELIVERED, Set.of(),
            CANCELLED, Set.of());

    private static final Map<ShipmentStatus, Set<ShipmentStatus>> SOURCES = Arrays.stream(values())
            .collect(Collectors.toUnmodifiableMap(status -> status, target -> Arrays.stream(values())
                    .filter(source -> TRANSITIONS.get(source).contains(target))
                    .collect(Collectors.toUnmodifiableSet())));

    /** 能推进到 target 的全部前态；条件更新（{@code WHERE status IN (...)}）的合法前置集 */
    public static Set<ShipmentStatus> sourcesOf(ShipmentStatus target) {
        return SOURCES.getOrDefault(target, Set.of());
    }

    /** 终态：签收或取消之后不再有事实能推进它，轮询与异常扫描据此放过 */
    public boolean terminal() {
        return this == DELIVERED || this == CANCELLED;
    }

    /** 是否占用订单行的有效发货量：只有真的交出去的包裹算（待发货与已取消都不算） */
    public boolean countsTowardShipped() {
        return this == DISPATCHED || this == DELIVERED;
    }
}
