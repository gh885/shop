package com.shop.platform.account.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/**
 * 员工信息（me 出参的 service 形状）：role 为岗位枚举名，permissions 为展开后的具体权限码。
 *
 * <p>本 record 即 HTTP 出参（无独立 Response 镜像）：字段只减不增，改动等于改接口。
 */
public record StaffInfo(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String employeeNo,
        @Schema(requiredMode = REQUIRED, nullable = true) String displayName,
        @Schema(requiredMode = REQUIRED, nullable = true) String role,
        @Schema(requiredMode = REQUIRED) List<String> permissions) {}
