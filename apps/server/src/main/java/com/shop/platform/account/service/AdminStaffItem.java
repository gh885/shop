package com.shop.platform.account.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.account.model.StaffStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 管理端员工列表的一行：员工号可登录，岗位以枚举名出参，未知岗位按空值展示。 */
public record AdminStaffItem(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String employeeNo,
        @Schema(requiredMode = REQUIRED, nullable = true) String displayName,
        @Schema(requiredMode = REQUIRED) StaffStatus status,
        @Schema(requiredMode = REQUIRED, nullable = true) String role,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {}
