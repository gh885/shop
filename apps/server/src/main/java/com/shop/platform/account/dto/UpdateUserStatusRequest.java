package com.shop.platform.account.dto;

import com.shop.platform.account.model.UserStatus;
import jakarta.validation.constraints.NotNull;

/** 管理端封号：设置买家账号状态（ACTIVE=启用 / DISABLED=禁用），唯一必填就是目标状态 */
public record UpdateUserStatusRequest(@NotNull UserStatus status) {}
