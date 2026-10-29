package com.shop.platform.governance.service;

import com.shop.platform.audit.api.AuditCommand;
import com.shop.platform.audit.api.AuditEntry;
import com.shop.platform.audit.api.FieldChange;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.Ids;
import com.shop.platform.governance.events.SellerResumed;
import com.shop.platform.governance.events.SellerSuspended;
import com.shop.platform.governance.mapper.GovernanceMapper;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 商家经营状态的平台侧处置。状态在 {@code governance.seller_profile}，不在 seller.merchant——
 * 后者是身份/账号状态，前者是「还能不能在平台卖」的治理结论。
 */
@Component
public class GovernanceEnforcementService {

    private final GovernanceMapper governance;
    private final AuditCommand audit;
    private final ApplicationEventPublisher events;

    public GovernanceEnforcementService(
            GovernanceMapper governance, AuditCommand audit, ApplicationEventPublisher events) {
        this.governance = Objects.requireNonNull(governance, "governance");
        this.audit = Objects.requireNonNull(audit, "audit");
        this.events = Objects.requireNonNull(events, "events");
    }

    @Transactional
    public void suspend(UUID merchantId, String reason, UUID operatorId) {
        changeStatus(merchantId, "active", "suspended", reason, operatorId, "governance.seller.suspended");
        events.publishEvent(new SellerSuspended(
                Ids.newId(), merchantId, reason == null ? "平台暂停经营" : reason, operatorId, Instant.now()));
    }

    @Transactional
    public void resume(UUID merchantId, String reason, UUID operatorId) {
        changeStatus(merchantId, "suspended", "active", reason, operatorId, "governance.seller.resumed");
        events.publishEvent(new SellerResumed(
                Ids.newId(), merchantId, reason == null ? "平台恢复经营" : reason, operatorId, Instant.now()));
    }

    private void changeStatus(UUID merchantId, String from, String to, String reason, UUID operatorId, String action) {
        if (governance.profileStatus(merchantId).isEmpty()) {
            throw BusinessException.notFound("商家治理档案不存在: " + merchantId);
        }
        if (governance.updateProfileStatus(merchantId, from, to) == 0) {
            throw BusinessException.conflict("SELLER_STATUS_CONFLICT", "商家当前状态不是 " + from + "，不能改成 " + to);
        }
        audit.record(AuditEntry.byStaff(
                action,
                "seller_profile",
                merchantId.toString(),
                operatorId,
                null,
                Map.of(
                        "status",
                        FieldChange.of(from, to),
                        "reason",
                        reason == null ? FieldChange.to("") : FieldChange.to(reason))));
    }
}
