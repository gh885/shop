package com.shop.platform.account.controller;

import com.shop.platform.account.dto.UpdateStaffStatusRequest;
import com.shop.platform.account.dto.UpdateUserStatusRequest;
import com.shop.platform.account.service.AuthService;
import com.shop.platform.account.service.StaffService;
import com.shop.platform.common.Permissions;
import com.shop.platform.common.StaffContext;
import com.shop.platform.infra.security.authz.RequirePermission;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理端账号封禁（C12）：买家与平台员工的禁用/启用。账号体系两套独立，但封号是同一个治理动作，
 * 收在一个 Controller；授权统一 {@code STAFF_MANAGE}（仅 SUPER_ADMIN，见 permission-codes.md）。
 */
@Tag(name = "admin-account", description = "管理端账号封禁（买家/员工禁用与启用）")
@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
@RequirePermission(Permissions.STAFF_MANAGE)
public class AdminAccountController {

    private final AuthService authService;
    private final StaffService staffService;

    /** PATCH /admin/users/{id}/status —— 禁用/启用买家（封号闸门链见 AuthService.updateUserStatus 注释） */
    @PatchMapping("/users/{id}/status")
    public void adminUpdateUserStatus(@PathVariable UUID id, @Valid @RequestBody UpdateUserStatusRequest req) {
        authService.updateUserStatus(id, req.status(), StaffContext.get());
    }

    /** PATCH /admin/staff/{id}/status —— 禁用/启用员工；禁用同时吊销其全端会话 */
    @PatchMapping("/staff/{id}/status")
    public void adminUpdateStaffStatus(@PathVariable UUID id, @Valid @RequestBody UpdateStaffStatusRequest req) {
        staffService.updateStaffStatus(id, req.status(), StaffContext.get());
    }
}
