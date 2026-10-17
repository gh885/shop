package com.shop.platform.order.model;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 主订单状态机 —— 一次支付的生死线，与履约无关：待支付 → 已支付 → 已关闭。
 *
 * <p>主订单只承载支付与金额汇总（docs/domain/order-model.md §3），履约进度在子订单，售后进度在退款单。
 * 关单原因收在 {@link TradeClosedReason}，是 {@code status = CLOSED} 时的必填事实。
 *
 * <p>形状照 {@link OrderStatus}：{@link #TRANSITIONS} 是唯一真相，{@link #sourcesOf} 供条件更新反推合法前态。
 * DB 列存 {@code name()}。
 */
@Schema(enumAsRef = true)
public enum TradeStatus {

    /** 待支付 */
    PENDING_PAYMENT,

    /** 已支付 */
    PAID,

    /** 已关闭（终态） */
    CLOSED;

    private static final Map<TradeStatus, Set<TradeStatus>> TRANSITIONS = Map.of(
            PENDING_PAYMENT, Set.of(PAID, CLOSED),
            PAID, Set.of(CLOSED),
            CLOSED, Set.of());

    private static final Map<TradeStatus, Set<TradeStatus>> SOURCES = TRANSITIONS.entrySet().stream()
            .collect(Collectors.toMap(Map.Entry::getKey, e -> TRANSITIONS.entrySet().stream()
                    .filter(other -> other.getValue().contains(e.getKey()))
                    .map(Map.Entry::getKey)
                    .collect(Collectors.toSet())));

    /** 能转移到 target 的全部源状态：条件更新（WHERE status IN (...)）的合法前置集 */
    public static Set<TradeStatus> sourcesOf(TradeStatus target) {
        return SOURCES.getOrDefault(target, Set.of());
    }

    /** 终态不再参与任何转移 */
    public boolean terminal() {
        return this == CLOSED;
    }
}
