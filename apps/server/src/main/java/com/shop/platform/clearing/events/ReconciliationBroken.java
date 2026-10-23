package com.shop.platform.clearing.events;

import com.shop.platform.common.event.DomainEvent;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 对账发现了差异。
 *
 * <p>带上 {@code runId} 而不是把差异明细塞进事件：告警侧要的是"出事了、去看第几次",
 * 不是一万条账户明细。明细在 {@code clearing.reconciliation_run.findings} 里。
 *
 * <p>{@code counts} 是每类差异的真实数量（不是样本数）——样本会被截断到 20 条，
 * 用样本数当告警阈值会低估规模。
 *
 * <p><b>这个事件没有消费者。</b> 它和 {@code SplitPosted} 一样是给将来的告警/工单留的钩子；
 * 现在唯一的出口是 {@code GET /api/admin/clearing/reconciliation}。
 */
public record ReconciliationBroken(UUID eventId, UUID runId, List<KindCount> counts, Instant detectedAt)
        implements DomainEvent {

    public ReconciliationBroken {
        counts = List.copyOf(counts);
    }

    /**
     * @param kind  见 {@code FindingKind.dbValue()}，如 {@code balance_mismatch}
     * @param count 该类差异的真实数量
     */
    public record KindCount(String kind, int count) {}
}
