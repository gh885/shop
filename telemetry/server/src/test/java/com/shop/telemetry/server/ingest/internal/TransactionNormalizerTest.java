package com.shop.telemetry.server.ingest.internal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.shop.telemetry.server.store.EventRecord;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * transaction 归一化。与 error 的关键差别（不分组、必须有 trace_id、时间取起点）都在这里钉住。
 */
class TransactionNormalizerTest {

    private static final Instant NOW = Instant.parse("2026-10-30T12:00:00Z");

    private final TransactionNormalizer normalizer = new TransactionNormalizer(JsonMapper.builder().build());

    @Test
    void normalizesBrowserTransaction() throws IOException {
        EventRecord event = ok(fixture("browser-transaction.event.json"));

        assertEquals("transaction", event.kind());
        assertEquals("1b2c3d4e5f60718293a4b5c6d7e8f901", event.eventId());
        assertEquals("7c9e6679b1a24a3f8e5d0c1b2a394857", event.traceId());
        assertEquals("9a1b0c2d3e4f5061", event.spanId());
        assertEquals("GET /checkout/:step", event.transaction());
        assertEquals("web@1.4.0", event.release());
        assertEquals("t_1001", event.tenantId());
        assertNull(event.fingerprint(), "事务不参与分组");
        // 起点而不是终点：trace 视图按开始时间排
        assertEquals(Instant.ofEpochMilli(1_791_234_555_000L), event.occurredAt());
    }

    /** 没有 trace_id 的事务对 trace 视图毫无价值——丢弃，但要有可查的原因。 */
    @Test
    void dropsTransactionWithoutTraceId() {
        TransactionNormalizer.TransactionResult result = normalizer.normalize(
                "1",
                """
                {"type":"transaction","event_id":"1b2c3d4e5f60718293a4b5c6d7e8f901",
                 "start_timestamp":1791234555.0,"timestamp":1791234555.5,
                 "contexts":{"trace":{"span_id":"9a1b0c2d3e4f5061"}}}
                """,
                NOW);

        TransactionNormalizer.TransactionResult.Drop drop =
                assertInstanceOf(TransactionNormalizer.TransactionResult.Drop.class, result);
        assertEquals(TransactionNormalizer.REASON_NO_TRACE, drop.reason());
    }

    @Test
    void dropsUnparsablePayload() {
        TransactionNormalizer.TransactionResult result = normalizer.normalize("1", "not-json", NOW);

        TransactionNormalizer.TransactionResult.Drop drop =
                assertInstanceOf(TransactionNormalizer.TransactionResult.Drop.class, result);
        assertEquals(TransactionNormalizer.REASON_UNPARSABLE, drop.reason());
    }

    /** 客户端没给 event_id 时用内容哈希：重投两次必须是同一个 id，否则幂等就失效了。 */
    @Test
    void fallsBackToContentHashWhenEventIdMissing() {
        String payload =
                """
                {"type":"transaction","start_timestamp":1791234555.0,"timestamp":1791234555.5,
                 "contexts":{"trace":{"trace_id":"7c9e6679b1a24a3f8e5d0c1b2a394857","span_id":"9a1b0c2d3e4f5061"}}}
                """;

        EventRecord first = ok(payload);
        EventRecord second = ok(payload);

        assertNotNull(first.eventId());
        assertEquals(first.eventId(), second.eventId());
        assertEquals(32, first.eventId().length());
    }

    private EventRecord ok(String payload) {
        return assertInstanceOf(
                        TransactionNormalizer.TransactionResult.Ok.class, normalizer.normalize("1", payload, NOW))
                .event();
    }

    private static String fixture(String name) throws IOException {
        return Files.readString(Path.of("..", "proto", "fixtures", name));
    }
}
