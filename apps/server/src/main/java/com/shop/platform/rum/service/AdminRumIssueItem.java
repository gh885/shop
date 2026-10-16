package com.shop.platform.rum.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;

/**
 * 遥测问题列表的一行：「一个错误」而不是「一次上报」。
 *
 * <p>排序键是 {@link #sessions} 不是 {@link #events}：十万次上报可能是一个人写了个死循环刷出来的，
 * 十个会话各撞一次才是真问题。次数是噪声，**影响的会话数**才是影响面。
 *
 * <p>{@link #message} / {@link #route} 取的是组内的一条代表值：同一个指纹的 message 只在被指纹
 * 抹掉的那些片段（数字、UUID）上不同，route 同理。它们用来在列表里认出「这是哪一个问题」，
 * 不承诺是组内最新那一条——要看具体哪一次，点进明细。
 */
@Schema(description = "遥测问题（同一指纹 + 同一端的一组事件）")
public record AdminRumIssueItem(
        @Schema(requiredMode = REQUIRED, description = "错误指纹，同组内相同") String fingerprint,
        @Schema(requiredMode = REQUIRED) String app,
        @Schema(requiredMode = REQUIRED) String kind,
        @Schema(requiredMode = REQUIRED, nullable = true) String message,
        @Schema(requiredMode = REQUIRED, nullable = true) String route,
        @Schema(requiredMode = REQUIRED, description = "影响的会话数（去重），列表按它降序") long sessions,
        @Schema(requiredMode = REQUIRED, description = "上报条数") long events,
        @Schema(requiredMode = REQUIRED) OffsetDateTime firstSeen,
        @Schema(requiredMode = REQUIRED) OffsetDateTime lastSeen) {}
