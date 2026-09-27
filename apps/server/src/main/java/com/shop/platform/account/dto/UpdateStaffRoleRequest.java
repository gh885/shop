package com.shop.platform.account.dto;

import com.shop.platform.account.model.StaffRole;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/** 调整平台员工岗位（STAFF_MANAGE，仅超管）。只改岗位，不改状态——状态是另一条动作。 */
@Schema(description = "调整平台员工岗位")
public record UpdateStaffRoleRequest(@NotNull @Schema(description = "目标岗位") StaffRole role) {}
