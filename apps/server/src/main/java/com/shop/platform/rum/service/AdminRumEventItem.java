package com.shop.platform.rum.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 遥测明细列表的一行。
 *
 * <p>**刻意不含 {@code payload}**：整条原件里有堆栈、面包屑、设备，一条几 KB，一页 20 条就是几十 KB
 * 只为了显示一个摘要。原件是 {@link AdminRumEventDetail} 的事，只有当人真的点开某一条时才取。
 *
 * <p>{@code userId} / {@code sessionId} 在这儿现身是排查的必需（「这个错误影响了谁」靠的就是它们），
 * 也正因如此这个端点必须挂权限码——它是这张表里唯一带人味的两列，脱敏链不碰它们
 * （见 {@code PiiRedactionProcessor}：那里脱的是手机号/邮箱/令牌，不是行为标识）。
 */
@Schema(description = "遥测事件明细（不含整条原件）")
public record AdminRumEventItem(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED, description = "客户端事件时刻，可能被兜底成接收时刻") OffsetDateTime ts,
        @Schema(requiredMode = REQUIRED, description = "服务端落库时刻，可信") OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) String app,
        @Schema(requiredMode = REQUIRED) String kind,
        @Schema(requiredMode = REQUIRED, nullable = true) String name,
        @Schema(requiredMode = REQUIRED, nullable = true) String version,
        @Schema(requiredMode = REQUIRED, nullable = true) String env,
        @Schema(requiredMode = REQUIRED, nullable = true) String route,
        @Schema(requiredMode = REQUIRED, nullable = true) String sessionId,
        @Schema(requiredMode = REQUIRED, nullable = true) String userId,
        @Schema(requiredMode = REQUIRED, nullable = true) String fingerprint,
        @Schema(requiredMode = REQUIRED, nullable = true) String message) {}
