package com.shop.platform.governance.service;

import com.shop.platform.audit.api.AuditCommand;
import com.shop.platform.audit.api.AuditEntry;
import com.shop.platform.audit.api.FieldChange;
import com.shop.platform.common.BusinessException;
import com.shop.platform.governance.mapper.GovernanceOnboardingMapper;
import com.shop.platform.infra.event.EventInbox;
import com.shop.platform.seller.api.MerchantQuery;
import com.shop.platform.seller.api.OnboardingCommand;
import com.shop.platform.seller.events.MerchantRegistered;
import com.shop.platform.seller.events.MerchantResubmitted;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 入驻审核。「能不能卖」是治理结论不是身份事实，所以判定住本模块的 {@code seller_profile}，
 * 身份（merchant/operator/shop）与入驻申请单归 seller——两边靠事件与命令握手：
 * 注册发 {@code MerchantRegistered} 落 {@code applied} 进队列；通过/驳回在本模块 CAS 档案，
 * 同一事务里经 {@code OnboardingCommand} 把申请单翻到终态——
 * 反向影响走 api 命令不靠监听，否则卖家端的重提闸门会有一段「已通过却重提报错」的窗口。
 *
 * <p>审核通过即生效，不留 approved 中间态——那个状态没人推进，等于把商家卡死在队列里。
 * 通过只放行 profileOk 这一道门；类目/品牌授权与资质另判，{@code canSell} 顺序不变。
 */
@Component
public class GovernanceOnboardingService {

    /** 审核队列一次最多拉多少条。与商品审核队列同一个口径：靠人处理，不设分页。 */
    public static final int QUEUE_LIMIT = 100;

    private final GovernanceOnboardingMapper mapper;
    private final MerchantQuery merchants;
    private final OnboardingCommand sellerOnboarding;
    private final AuditCommand audit;
    private final EventInbox inbox;

    public GovernanceOnboardingService(
            GovernanceOnboardingMapper mapper,
            MerchantQuery merchants,
            OnboardingCommand sellerOnboarding,
            AuditCommand audit,
            EventInbox inbox) {
        this.mapper = Objects.requireNonNull(mapper, "mapper");
        this.merchants = Objects.requireNonNull(merchants, "merchants");
        this.sellerOnboarding = Objects.requireNonNull(sellerOnboarding, "sellerOnboarding");
        this.audit = Objects.requireNonNull(audit, "audit");
        this.inbox = Objects.requireNonNull(inbox, "inbox");
    }

    /**
     * 审核队列。{@code status} 传 null 看全部；主体名称经 seller 的 {@code MerchantQuery} 批查拼装，
     * 队列上限 {@value #QUEUE_LIMIT} 条，批查不越界。
     */
    public List<QueueItem> queue(String status) {
        List<GovernanceOnboardingMapper.ProfileRow> rows = mapper.listProfiles(status, QUEUE_LIMIT);
        var names = merchants.namesByIds(rows.stream()
                .map(GovernanceOnboardingMapper.ProfileRow::merchantId)
                .toList());
        return rows.stream()
                .map(row -> new QueueItem(
                        row.merchantId(), names.get(row.merchantId()), row.status(), row.level(), row.updatedAt()))
                .toList();
    }

    @Transactional
    public void approve(UUID merchantId, UUID staffId) {
        requireProfile(merchantId);
        if (mapper.approveProfile(merchantId) == 0) {
            throw BusinessException.conflict("SELLER_STATUS_CONFLICT", "商家当前不在待审状态，不能通过");
        }
        sellerOnboarding.approve(merchantId);
        audit.record(AuditEntry.byStaff(
                "governance.seller.approved",
                "seller_profile",
                merchantId.toString(),
                staffId,
                null,
                Map.of("status", FieldChange.of("applied", "active"))));
    }

    @Transactional
    public void reject(UUID merchantId, String reason, UUID staffId) {
        requireProfile(merchantId);
        if (mapper.rejectProfile(merchantId) == 0) {
            throw BusinessException.conflict("SELLER_STATUS_CONFLICT", "商家当前不在待审状态，不能驳回");
        }
        sellerOnboarding.reject(merchantId, reason);
        audit.record(AuditEntry.byStaff(
                "governance.seller.rejected",
                "seller_profile",
                merchantId.toString(),
                staffId,
                null,
                Map.of("status", FieldChange.of("applied", "rejected"), "reason", FieldChange.to(reason))));
    }

    private void requireProfile(UUID merchantId) {
        if (mapper.profileStatus(merchantId).isEmpty()) {
            throw BusinessException.notFound("商家治理档案不存在: " + merchantId);
        }
    }

    /** 注册事件落地：建档案进待审队列。重复投递由档案唯一键 + inbox 双保险挡掉。 */
    @ApplicationModuleListener
    public void on(MerchantRegistered event) {
        if (!inbox.claim("governance.merchant-registered", event.eventId())) {
            return;
        }
        mapper.insertProfileIfAbsent(event.merchantId());
    }

    /** 重提：rejected → applied。0 行（重投或状态已推进）静默忽略——CAS 本身就是幂等裁决。 */
    @ApplicationModuleListener
    public void on(MerchantResubmitted event) {
        if (!inbox.claim("governance.merchant-resubmitted", event.eventId())) {
            return;
        }
        mapper.reopenProfile(event.merchantId());
    }

    /** 审核队列出参。name 缺失表示 seller 侧查无此商家（兜底展示，不拦审核操作）。 */
    public record QueueItem(
            UUID merchantId, String name, String status, String level, java.time.OffsetDateTime updatedAt) {}
}
