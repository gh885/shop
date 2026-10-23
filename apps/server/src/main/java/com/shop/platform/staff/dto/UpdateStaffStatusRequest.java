package com.shop.platform.staff.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** 员工启用/禁用（ACC 两态）。 */
public record UpdateStaffStatusRequest(
        @NotBlank @Pattern(regexp = "active|disabled", message = "状态必须是 active / disabled") String status) {}
