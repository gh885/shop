package com.shop.platform.aftersale.model;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 退款单状态机 —— 一次退款的完整生命周期（docs/domain/order-model.md §4.5）。
 *
 * <p>三条路径共用一套状态，按退款单 {@link RefundType} 走不同分支：
 * <ul>
 *   <li>仅退款 / 补偿：待处理 → 已同意 → 退款中 → 已退款
 *   <li>退货退款：待处理 → 已同意 → 待寄回 → 已寄回 → 卖家已收货 → 退款中 → 已退款
 * </ul>
 *
 * <p>「已寄回」之后货物已离开买家，买家不能再撤销；卖家确认拦截成功才由卖家转「已撤销」。
 * 渠道调用失败不改状态，只追加 {@code RefundExecution}；重试耗尽转「失败」，人工/系统重试再回「退款中」。
 *
 * <p>形状照 {@code OrderStatus}：{@link #TRANSITIONS} 是唯一真相，{@link #sourcesOf} 供条件更新反推合法前态。
 */
@Schema(enumAsRef = true)
public enum RefundStatus {

    /** 待处理（卖家未处置） */
    PENDING,

    /** 已同意（卖家同意，退款进入执行或退货流程） */
    AGREED,

    /** 待寄回（仅退货退款：买家回寄） */
    RETURN_PENDING,

    /** 已寄回（仅退货退款：买家已填回寄物流） */
    RETURNED,

    /** 卖家已收货（仅退货退款：卖家确认收到退货） */
    RECEIVED,

    /** 退款中（已向支付渠道发起退款，失败重试期间也停在这里） */
    REFUNDING,

    /** 已退款（终态） */
    REFUNDED,

    /** 已拒绝（终态） */
    REJECTED,

    /** 已撤销（终态；买家主动撤销或卖家确认拦截成功） */
    CANCELLED,

    /** 失败（自动重试耗尽、等待人工处置；重试期内仍按未完结对待） */
    FAILED;

    private static final Map<RefundStatus, Set<RefundStatus>> TRANSITIONS = Map.of(
            PENDING, Set.of(AGREED, REJECTED, CANCELLED),
            AGREED, Set.of(RETURN_PENDING, REFUNDING),
            RETURN_PENDING, Set.of(RETURNED, CANCELLED),
            RETURNED, Set.of(RECEIVED, CANCELLED),
            RECEIVED, Set.of(REFUNDING),
            REFUNDING, Set.of(REFUNDED, FAILED),
            FAILED, Set.of(REFUNDING),
            REFUNDED, Set.of(),
            REJECTED, Set.of(),
            CANCELLED, Set.of());

    private static final Map<RefundStatus, Set<RefundStatus>> SOURCES = TRANSITIONS.entrySet().stream()
            .collect(Collectors.toMap(Map.Entry::getKey, e -> TRANSITIONS.entrySet().stream()
                    .filter(other -> other.getValue().contains(e.getKey()))
                    .map(Map.Entry::getKey)
                    .collect(Collectors.toSet())));

    /** 能转移到 target 的全部源状态：条件更新（WHERE status IN (...)）的合法前置集 */
    public static Set<RefundStatus> sourcesOf(RefundStatus target) {
        return SOURCES.getOrDefault(target, Set.of());
    }

    /** 未出钱的终态：已拒绝 / 已撤销；已退款是出钱的终态 */
    public boolean terminalWithoutMoney() {
        return this == REJECTED || this == CANCELLED;
    }

    /**
     * 未完结：还占着「同一订单行至多一张未完结退款单」的闸门。
     *
     * <p>{@link #FAILED} 不在内——它是否仍算未完结取决于重试期，由服务层按重试次数判定（§8）。
     * 已退款、已拒绝、已撤销也都不在内。
     */
    public boolean open() {
        return Arrays.asList(PENDING, AGREED, RETURN_PENDING, RETURNED, RECEIVED, REFUNDING)
                .contains(this);
    }
}
