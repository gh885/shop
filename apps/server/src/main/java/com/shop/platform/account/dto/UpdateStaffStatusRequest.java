package com.shop.platform.account.dto;

import com.shop.platform.account.model.StaffStatus;
import jakarta.validation.constraints.NotNull;

/** 管理端停用员工：设置员工状态（ACTIVE=启用 / DISABLED=禁用），唯一必填就是目标状态 */
public record UpdateStaffStatusRequest(@NotNull StaffStatus status) {}
