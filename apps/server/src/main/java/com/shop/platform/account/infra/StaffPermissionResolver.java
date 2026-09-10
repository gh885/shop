package com.shop.platform.account.infra;

import com.shop.platform.account.service.StaffService;
import com.shop.platform.common.StaffContext;
import com.shop.platform.infra.security.authz.PermissionResolver;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 平台员工域判权适配：从 StaffContext 取当前员工 ID，实时查库解析有效权限集
 * （含禁用即空集、SUPER_ADMIN 通配）。当前请求不在员工域（StaffContext 无值）时返回 null 让位。
 */
@Component
@RequiredArgsConstructor
public class StaffPermissionResolver implements PermissionResolver {

    private final StaffService staffService;

    @Override
    public Set<String> permissions() {
        UUID staffId = StaffContext.get();
        return staffId == null ? null : staffService.effectivePermissions(staffId);
    }
}
