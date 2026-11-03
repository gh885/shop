package com.shop.platform.governance.controller;

import com.shop.platform.governance.service.GovernanceEnforcementService;
import com.shop.platform.governance.service.GovernanceOnboardingService;
import com.shop.platform.infra.security.AccessScope;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 商家入驻审核与经营处置。
 *
 * <p>入驻审核用 {@link Permission#SHOP_REVIEW}，处置用 {@link Permission#GOVERNANCE_REVIEW}——
 * 「第一次进门要不要放行」和「已经在里面的人要不要请出去」是两种爆炸半径，能审核新商家的人
 * 不必能暂停老商家，反之亦然。
 */
@RestController
@RequestMapping("/api/admin/governance/sellers")
public class AdminGovernanceSellerController {

    private final GovernanceEnforcementService enforcement;
    private final GovernanceOnboardingService onboarding;
    private final Authorizer authorizer;

    public AdminGovernanceSellerController(
            GovernanceEnforcementService enforcement, GovernanceOnboardingService onboarding, Authorizer authorizer) {
        this.enforcement = enforcement;
        this.onboarding = onboarding;
        this.authorizer = authorizer;
    }

    /** 入驻审核队列。status 传 applied/rejected/active 过滤，不传看全部。 */
    @GetMapping
    public List<GovernanceOnboardingService.QueueItem> queue(@RequestParam(required = false) String status) {
        authorizer.platform(Permission.SHOP_REVIEW);
        return onboarding.queue(status);
    }

    /** 入驻审核通过。通过即生效——没有 approved 中间态， {@code canSell} 的 profile 门从此放行。 */
    @PostMapping("/{merchantId}/approve")
    public void approve(@PathVariable UUID merchantId) {
        AccessScope.Platform scope = authorizer.platform(Permission.SHOP_REVIEW);
        onboarding.approve(merchantId, scope.subjectId());
    }

    /** 入驻审核驳回。理由必填——商家要能据它改材料再重提。 */
    @PostMapping("/{merchantId}/reject")
    public void reject(@PathVariable UUID merchantId, @Valid @RequestBody RejectRequest request) {
        AccessScope.Platform scope = authorizer.platform(Permission.SHOP_REVIEW);
        onboarding.reject(merchantId, request.reason(), scope.subjectId());
    }

    @PostMapping("/{merchantId}/suspend")
    public void suspend(@PathVariable UUID merchantId, @Valid @RequestBody ReasonRequest request) {
        AccessScope.Platform scope = authorizer.platform(Permission.SHOP_SUSPEND);
        enforcement.suspend(merchantId, request.reason(), scope.subjectId());
    }

    @PostMapping("/{merchantId}/resume")
    public void resume(@PathVariable UUID merchantId, @Valid @RequestBody ReasonRequest request) {
        AccessScope.Platform scope = authorizer.platform(Permission.SHOP_SUSPEND);
        enforcement.resume(merchantId, request.reason(), scope.subjectId());
    }

    public record ReasonRequest(@Size(max = 500) String reason) {}

    public record RejectRequest(@NotBlank @Size(max = 500) String reason) {}
}
