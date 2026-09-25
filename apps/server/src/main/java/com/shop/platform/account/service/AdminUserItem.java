package com.shop.platform.account.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.account.model.UserStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 管理端买家列表的一行：手机号已脱敏，账号治理不需要密码或注销内部字段。 */
public record AdminUserItem(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String phone,
        @Schema(requiredMode = REQUIRED, nullable = true) String nickname,
        @Schema(requiredMode = REQUIRED) UserStatus status,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime lastLoginAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {}
