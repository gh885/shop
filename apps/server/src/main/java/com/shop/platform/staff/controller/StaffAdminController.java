package com.shop.platform.staff.controller;

import com.shop.platform.common.PagingRules;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.staff.dto.CreateStaffRequest;
import com.shop.platform.staff.dto.UpdateStaffRoleRequest;
import com.shop.platform.staff.dto.UpdateStaffStatusRequest;
import com.shop.platform.staff.service.StaffManagementService;
import com.shop.platform.staff.service.StaffProfileService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台员工管理（STAFF_MANAGE）：列表、创建、调岗、禁用/启用。判权用显式调用而不是注解——
 * 与全项目的口径一致（见 {@link Authorizer}）。
 */
@RestController
@RequestMapping("/api/admin/staff")
public class StaffAdminController {

    private final StaffManagementService management;
    private final StaffProfileService profiles;
    private final Authorizer authorizer;

    public StaffAdminController(
            StaffManagementService management, StaffProfileService profiles, Authorizer authorizer) {
        this.management = management;
        this.profiles = profiles;
        this.authorizer = authorizer;
    }

    /**
     * 员工列表。没有它，创建与调岗都是半个入口——管理员建完人之后找不到那个人。
     *
     * @param status 传 active / disabled 筛状态；不传看全部
     * @param keyword 同时匹配登录名与展示名（管理员两种都可能知道）
     * @param cursor 上一页的 nextCursor
     * @param limit 服务端 clamp 到 1–100
     */
    @GetMapping
    public StaffProfileService.StaffPage listStaff(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @Size(max = 64) String keyword,
            @RequestParam(required = false) String cursor,
            @Min(1) @Max(PagingRules.MAX_LIMIT) @RequestParam(defaultValue = "20") int limit) {
        authorizer.check(Permission.STAFF_MANAGE);
        return profiles.adminPage(status, keyword, cursor, limit);
    }

    @PostMapping
    public void createStaff(@Valid @RequestBody CreateStaffRequest request) {
        authorizer.check(Permission.STAFF_MANAGE);
        management.create(
                request.loginName(),
                request.password(),
                request.displayName(),
                request.role(),
                authorizer.current().operatorId());
    }

    @PutMapping("/{id}/role")
    public void updateRole(@PathVariable UUID id, @Valid @RequestBody UpdateStaffRoleRequest request) {
        authorizer.check(Permission.STAFF_MANAGE);
        management.updateRole(id, request.role(), authorizer.current().operatorId());
    }

    @PatchMapping("/{id}/status")
    public void updateStaffStatus(@PathVariable UUID id, @Valid @RequestBody UpdateStaffStatusRequest request) {
        authorizer.check(Permission.STAFF_MANAGE);
        management.updateStatus(id, request.status(), authorizer.current().operatorId());
    }
}
