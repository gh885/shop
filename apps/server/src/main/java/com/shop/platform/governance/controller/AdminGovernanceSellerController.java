package com.shop.platform.governance.controller;

import com.shop.platform.common.BusinessException;
import com.shop.platform.governance.service.GovernanceEnforcementService;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.Permission;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 商家经营处置：暂停 / 恢复。暂停会经 {@code SellerSuspended} 级联下架在线商品。 */
@RestController
@RequestMapping("/api/admin/governance/sellers")
public class AdminGovernanceSellerController {

    private final GovernanceEnforcementService enforcement;
    private final Authorizer authorizer;

    public AdminGovernanceSellerController(GovernanceEnforcementService enforcement, Authorizer authorizer) {
        this.enforcement = enforcement;
        this.authorizer = authorizer;
    }

    @PostMapping("/{merchantId}/suspend")
    public void suspend(@PathVariable UUID merchantId, @Valid @RequestBody ReasonRequest request) {
        requireStaff();
        enforcement.suspend(merchantId, request.reason(), authorizer.current().operatorId());
    }

    @PostMapping("/{merchantId}/resume")
    public void resume(@PathVariable UUID merchantId, @Valid @RequestBody ReasonRequest request) {
        requireStaff();
        enforcement.resume(merchantId, request.reason(), authorizer.current().operatorId());
    }

    private void requireStaff() {
        authorizer.check(Permission.GOVERNANCE_REVIEW);
        if (!CurrentOperator.TYPE_STAFF.equals(authorizer.current().operatorType())) {
            throw BusinessException.forbidden("STAFF_ONLY", "只有平台员工可以处置商家");
        }
    }

    public record ReasonRequest(@Size(max = 500) String reason) {}
}
