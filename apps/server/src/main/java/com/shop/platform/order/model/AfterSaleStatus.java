package com.shop.platform.order.model;

import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 售后状态机 —— 与履约主状态机（{@link OrderStatus}）正交的第二条线，接管「履约完成之后的交易纠葛」：
 * 主状态停在 COMPLETED 不再动，退款只在本线上流转。
 *
 * <p>流转：NONE → APPLYING →（REFUNDED 卖家同意即退款 / REJECTED 卖家拒绝 / CLOSED 买家撤销）。
 * 卖家同意与退款单据落库在同一事务里一次到位，故没有「已同意待退款」的中间态。
 * DB 列存 {@code name()}。
 */
public enum AfterSaleStatus {

    /** 无售后（默认） */
    NONE,

    /** 售后申请中（卖家待处理） */
    APPLYING,

    /** 已退款（终态） */
    REFUNDED,

    /** 卖家已拒绝（终态） */
    REJECTED,

    /** 买家撤销售后申请（终态） */
    CLOSED;

    /** 状态图（源态 → 目标态）：售后线合法转移的唯一真相 */
    private static final Map<AfterSaleStatus, Set<AfterSaleStatus>> TRANSITIONS = Map.of(
            NONE, Set.of(APPLYING),
            APPLYING, Set.of(REFUNDED, REJECTED, CLOSED),
            REFUNDED, Set.of(),
            REJECTED, Set.of(),
            CLOSED, Set.of());

    /** 能转移到 target 的全部源态：条件更新（WHERE after_sale_status IN (...)）的合法前置集 */
    public static Set<AfterSaleStatus> sourcesOf(AfterSaleStatus target) {
        return TRANSITIONS.entrySet().stream()
                .filter(e -> e.getValue().contains(target))
                .map(Map.Entry::getKey)
                .collect(Collectors.toSet());
    }

    /**
     * target 的唯一源态：售后线每个目标态只有一个合法入边（转移表保证），
     * 审计流水的 fromStatus 据此推导，转移点不必硬写前态。
     */
    public static AfterSaleStatus soleSourceOf(AfterSaleStatus target) {
        Set<AfterSaleStatus> sources = sourcesOf(target);
        if (sources.size() != 1) {
            throw new IllegalStateException("售后状态 " + target + " 的源态不唯一: " + sources);
        }
        return sources.iterator().next();
    }
}
