package com.shop.platform.staff.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** 调整员工岗位。 */
public record UpdateStaffRoleRequest(
        @NotBlank @Pattern(regexp = "REVIEWER|OPS|SUPER_ADMIN", message = "岗位必须是 REVIEWER / OPS / SUPER_ADMIN")
                String role) {}
