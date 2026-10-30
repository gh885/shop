package com.shop.telemetry.server.events;

import com.shop.telemetry.server.symbolication.SymbolicatedStack;
import java.time.Instant;
import tools.jackson.databind.JsonNode;

/**
 * 事件详情的对外形状。
 *
 * <p>payload 在库里是 {@code jsonb}、在 {@link com.shop.telemetry.server.store.EventRecord}
 * 里是原始字符串；对外必须还原成**结构化 JSON**——否则前端拿到的是一个转义过的字符串，
 * 每个消费方都要自己再 parse 一次，且平台前端得为此引一个 JSON 解析器。
 *
 * <p>{@code stack} 是 payload 的**派生视图**（读取时符号化，见 {@code StackReader}），
 * 与 payload 并存而不是替换：原文永远可查，可读栈只是它的一个解释。
 */
public record EventDetail(
        long id,
        String eventId,
        Instant receivedAt,
        Instant occurredAt,
        Long issueId,
        String kind,
        String level,
        String platform,
        String release,
        String environment,
        String transaction,
        String tenantId,
        String traceId,
        String spanId,
        JsonNode payload,
        SymbolicatedStack stack) {}
