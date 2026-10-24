package com.shop.platform.staff.controller;

import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.staff.dto.CreateStaffRequest;
import com.shop.platform.staff.dto.UpdateStaffRoleRequest;
import com.shop.platform.staff.dto.UpdateStaffStatusRequest;
import com.shop.platform.staff.service.StaffManagementService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台员工管理（STAFF_MANAGE）：创建、调岗、禁用/启用。判权用显式调用而不是注解——
 * 与全项目的口径一致（见 {@link Authorizer}）。
 */
@RestController
@RequestMapping("/api/admin/staff")
public class StaffAdminController {

    private final StaffManagementService management;
    private final Authorizer authorizer;

    public StaffAdminController(StaffManagementService management, Authorizer authorizer) {
        this.management = management;
        this.authorizer = authorizer;
    }

    @PostMapping
    public void create(@Valid @RequestBody CreateStaffRequest request) {
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
    public void updateStatus(@PathVariable UUID id, @Valid @RequestBody UpdateStaffStatusRequest request) {
        authorizer.check(Permission.STAFF_MANAGE);
        management.updateStatus(id, request.status(), authorizer.current().operatorId());
    }
}
