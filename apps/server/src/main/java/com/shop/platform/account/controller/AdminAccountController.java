package com.shop.platform.account.controller;

import com.shop.platform.account.dto.AccountFieldRules;
import com.shop.platform.account.dto.AdminStaffQuery;
import com.shop.platform.account.dto.AdminUserQuery;
import com.shop.platform.account.dto.CreateStaffRequest;
import com.shop.platform.account.dto.UpdateStaffRoleRequest;
import com.shop.platform.account.dto.UpdateStaffStatusRequest;
import com.shop.platform.account.dto.UpdateUserStatusRequest;
import com.shop.platform.account.service.AdminStaffItem;
import com.shop.platform.account.service.AdminUserItem;
import com.shop.platform.account.service.AuthService;
import com.shop.platform.account.service.StaffService;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentStaff;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理端账号封禁（C12）：买家与平台员工的禁用/启用。账号体系两套独立，但封号是同一个治理动作，
 * 收在一个 Controller；授权统一 {@code STAFF_MANAGE}（仅 SUPER_ADMIN，见 contracts/permissions.yaml）。
 */
@Tag(name = "admin-account", description = "管理端账号封禁（买家/员工禁用与启用）")
@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
@Validated
@RequirePermission(Permissions.STAFF_MANAGE)
public class AdminAccountController {

    private final AuthService authService;
    private final StaffService staffService;

    /** GET /admin/users —— 买家账号列表；手机号在 service 边界已脱敏。 */
    @GetMapping("/users")
    public PageResult<AdminUserItem> listAdminUsers(
            @jakarta.validation.Valid PageParams pageParams,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @Size(max = AccountFieldRules.ADMIN_LIST_KEYWORD_MAX) String keyword) {
        return authService.pageAdminUsers(pageParams, new AdminUserQuery(status, keyword));
    }

    /** GET /admin/staff —— 平台员工列表；未知岗位以 null 返回，不让脏值阻断整个列表。 */
    @GetMapping("/staff")
    public PageResult<AdminStaffItem> listAdminStaff(
            @jakarta.validation.Valid PageParams pageParams,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @Size(max = AccountFieldRules.ADMIN_LIST_KEYWORD_MAX) String keyword) {
        return staffService.pageAdminStaff(pageParams, new AdminStaffQuery(status, keyword));
    }

    /** PATCH /admin/users/{id}/status —— 禁用/启用买家（封号闸门链见 AuthService.updateUserStatus 注释） */
    @PatchMapping("/users/{id}/status")
    public void adminUpdateUserStatus(
            @CurrentStaff UUID staffId, @PathVariable UUID id, @Valid @RequestBody UpdateUserStatusRequest req) {
        authService.updateUserStatus(id, req.status(), staffId);
    }

    /** PATCH /admin/staff/{id}/status —— 禁用/启用员工；禁用同时吊销其全端会话 */
    @PatchMapping("/staff/{id}/status")
    public void adminUpdateStaffStatus(
            @CurrentStaff UUID staffId, @PathVariable UUID id, @Valid @RequestBody UpdateStaffStatusRequest req) {
        staffService.updateStaffStatus(id, req.status(), staffId);
    }

    /**
     * POST /admin/staff —— 创建平台员工（ACC-57）。
     *
     * <p>201：新资源。201 的 Location 不给——管理端创建完就跳列表，没有「去新资源页」这个动作。
     */
    @PostMapping("/staff")
    @ResponseStatus(HttpStatus.CREATED)
    public void adminCreateStaff(@CurrentStaff UUID staffId, @Valid @RequestBody CreateStaffRequest req) {
        staffService.createStaff(req.employeeNo(), req.password(), req.displayName(), req.role(), staffId);
    }

    /** PUT /admin/staff/{id}/role —— 调整岗位；不能改自己岗位，末位超管不可降级 */
    @PutMapping("/staff/{id}/role")
    public void adminUpdateStaffRole(
            @CurrentStaff UUID staffId, @PathVariable UUID id, @Valid @RequestBody UpdateStaffRoleRequest req) {
        staffService.updateStaffRole(id, req.role(), staffId);
    }
}
