package com.shop.telemetry.server.ingest.internal;

import com.shop.telemetry.server.shared.Ids;
import com.shop.telemetry.server.store.EventRecord;
import java.time.Instant;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * transaction → 落库形状。
 *
 * <p>为什么它和 {@link EventNormalizer} 分开：transaction **不参与分组、不产生 issue**。
 * 混在一个归一化器里，每个字段的语义都要分叉（"title 对 transaction 是什么？"），
 * 而两者的读取方也完全不同（一个进 issue 列表，一个进 trace 视图）。
 *
 * <p>与 error 的两条差异：
 *
 * <ol>
 *   <li>**没有 trace_id 就丢弃**。一条不知道属于哪条链的事务，对 M1 毫无价值；
 *       而"丢弃"必须可查，所以走 {@code dropped} 表而不是静默吞掉。
 *   <li>**幂等键优先用 event_id**。transaction 是完整事件（带 event_id），不是原始 item；
 *       客户端没给时才退回内容哈希。
 * </ol>
 */
@Component
class TransactionNormalizer {

    static final String REASON_UNPARSABLE = "unparsable_transaction";
    static final String REASON_NO_TRACE = "transaction_without_trace_id";

    private final ObjectMapper json;

    TransactionNormalizer(ObjectMapper json) {
        this.json = json;
    }

    TransactionResult normalize(String projectId, String payload, Instant now) {
        JsonNode root;
        try {
            root = json.readTree(payload);
        } catch (RuntimeException e) {
            return new TransactionResult.Drop(REASON_UNPARSABLE);
        }
        if (root == null || !root.isObject()) {
            return new TransactionResult.Drop(REASON_UNPARSABLE);
        }

        JsonNode trace = root.path("contexts").path("trace");
        String traceId = hexOrNull(text(trace, "trace_id"), 32);
        if (traceId == null) {
            return new TransactionResult.Drop(REASON_NO_TRACE);
        }
        String spanId = hexOrNull(text(trace, "span_id"), 16);
        String eventId = text(root, "event_id");
        if (!EventNormalizer.isHex(eventId, 32)) {
            eventId = Ids.contentId(payload);
        }
        // 事务的"发生时间"是**开始时间**，不是结束时间：详情页和 trace 视图都按起点排。
        // 没有 start_timestamp 时退回通用解析（客户端只给了 timestamp 也认）。
        Instant startedAt = timestamp(root, "start_timestamp");
        if (startedAt == null) {
            startedAt = EventNormalizer.occurredAt(root, now);
        }

        EventRecord event = new EventRecord(
                projectId,
                eventId,
                startedAt,
                "transaction",
                text(root, "level"), // 通常是 null：事务不是"异常"，不该让 issue 列表长草
                text(root, "platform"),
                text(root, "release"),
                text(root, "environment"),
                text(root, "transaction"),
                text(root.path("tags"), "tenant.id"),
                traceId,
                spanId,
                null, // 不分组
                payload);
        return new TransactionResult.Ok(event);
    }

    /** Sentry 的时间戳是 epoch 秒的浮点。乱来的值（非正、未来 1 天以上）当作没给。 */
    private static Instant timestamp(JsonNode root, String field) {
        JsonNode node = root.path(field);
        if (!node.isNumber()) {
            return null;
        }
        double seconds = node.asDouble();
        if (seconds <= 0) {
            return null;
        }
        return Instant.ofEpochMilli((long) (seconds * 1000));
    }

    private static String text(JsonNode node, String field) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        JsonNode child = node.path(field);
        if (child.isMissingNode() || child.isNull() || !child.isString()) {
            return null;
        }
        String value = child.asString();
        return value.isBlank() ? null : value;
    }

    private static String hexOrNull(String value, int length) {
        return EventNormalizer.isHex(value, length) ? value : null;
    }

    /** 两种结局：落库，或带着原因丢弃。 */
    sealed interface TransactionResult {

        record Ok(EventRecord event) implements TransactionResult {}

        record Drop(String reason) implements TransactionResult {}
    }
}
