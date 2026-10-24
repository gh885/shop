package com.shop.platform.trust.api;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * 违规线索的接收口。检测模块（fulfillment 的时效检测等）调这里上报<b>事实</b>；
 * 扣多少分、要不要限流是治理的事，不在这里。
 *
 * <p><b>为什么是同步命令不是事件：</b> 检测发生在定时任务里，任务要知道"上报成功没有"——
 * 事件是发了就算成功的通知，任务重试时没法凭它判断线索落没落。
 *
 * <p>幂等由 {@code uq_clue_order (kind, seller_order_id)} 兜底：同一单同一种线索
 * 只会有一行，重复上报静默跳过，不抛——调用方不必为此写去重。
 */
public interface TrustCommand {

    /**
     * 上报一条线索。已报过的（同 kind 同 seller_order_id）什么都不做。
     *
     * @throws com.shop.platform.common.BusinessException 目前不会抛；留出参数校验的口子
     */
    void report(ViolationClue clue);

    /**
     * @param sellerOrderId 线索挂的商家单；没有对应单子的线索（未来）传 null
     * @param detail 给人看的事实描述，不带处置建议
     */
    record ViolationClue(ViolationKind kind, UUID merchantId, UUID sellerOrderId, Instant occurredAt, String detail) {

        public ViolationClue {
            Objects.requireNonNull(kind, "kind");
            Objects.requireNonNull(merchantId, "merchantId");
            Objects.requireNonNull(occurredAt, "occurredAt");
        }
    }
}
