package com.shop.platform.returns.service;

import com.shop.platform.infra.event.EventInbox;
import com.shop.platform.payment.events.RefundSucceeded;
import com.shop.platform.returns.mapper.CaseMapper;
import java.util.Objects;
import java.util.UUID;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * 退款到账，把售后单推到完成。
 *
 * <p>为什么需要它：渠道异步退款时，{@code confirmRefund} 那一刻只把状态推到 {@code refunding}，
 * 钱还没到。等 {@code RefundSucceeded} 到了才写"完成"和计数器——**钱先到，账后记**。
 *
 * <p>同步退款那条路已经在 {@code startRefund} 里当场完成了，这里只处理"当时没成功、后来成功"的情况，
 * 所以必须先判状态：不是 {@code refunding} 的直接跳过，避免重复回写计数器。
 */
@Component
public class RefundSucceededHandler {

    private final CaseMapper cases;
    private final RmaService rma;
    private final EventInbox inbox;

    public RefundSucceededHandler(CaseMapper cases, RmaService rma, EventInbox inbox) {
        this.cases = Objects.requireNonNull(cases, "cases");
        this.rma = Objects.requireNonNull(rma, "rma");
        this.inbox = Objects.requireNonNull(inbox, "inbox");
    }

    @ApplicationModuleListener
    public void on(RefundSucceeded event) {
        if (!inbox.claim("returns.refund-succeeded", event.eventId())) {
            return;
        }
        if (event.bizRef() == null) {
            return;
        }

        UUID caseId;
        try {
            caseId = UUID.fromString(event.bizRef());
        } catch (IllegalArgumentException e) {
            // bizRef 不是售后单号：这笔退款不是售后发起的，不归这里管
            return;
        }

        cases.findInternal(caseId)
                .filter(row -> "refunding".equals(row.status()))
                .ifPresent(row -> rma.completeAfterRefund(caseId));
    }
}
