package com.shop.platform.rum.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 单条事件的详情：{@link AdminRumEventItem} 的字段 + 整条原件。
 *
 * <p>字段不共用而是各写一份：两个 record 是**两个 wire 形状**，客户端按各自那份生成类型，
 * 合成一个带可空 payload 的形状会让「列表里有没有原件」变成运行时才知道的事。
 *
 * <p>{@link #payload} 给的是**字符串**，不是解析好的 JSON 对象：它是落库时原样存下来的那一串
 * （已脱敏），当不透明文档透传。为什么不在服务端解析——写侧存 String 正是为了绕开本仓库
 * Jackson 2/3 并存的那道坎（见 {@code RumEvent} 类注释），读侧再解析一次等于把那个决定推翻；
 * 而不透明透传的好处是**原件里的字段一个都不会在展示层被悄悄丢掉**——排查最怕的就是这个。
 */
@Schema(description = "遥测事件详情（含整条原件）")
public record AdminRumEventDetail(
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
        @Schema(requiredMode = REQUIRED, nullable = true) String message,
        @Schema(requiredMode = REQUIRED, description = "整条事件的 JSON 文本（已脱敏），含 stack / breadcrumbs / device")
                String payload) {}
