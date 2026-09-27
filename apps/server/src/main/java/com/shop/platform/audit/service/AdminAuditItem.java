package com.shop.platform.audit.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 审计列表的一行（wire 契约：字段只减不增）。action / targetType 给 code，中文名由前端词表映射。 */
@Schema(description = "操作审计记录")
public record AdminAuditItem(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String action,
        @Schema(requiredMode = REQUIRED) String targetType,
        @Schema(requiredMode = REQUIRED) String targetId,
        @Schema(requiredMode = REQUIRED) UUID operatorId,
        @Schema(requiredMode = REQUIRED, nullable = true) String operatorName,
        String detail,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {}
