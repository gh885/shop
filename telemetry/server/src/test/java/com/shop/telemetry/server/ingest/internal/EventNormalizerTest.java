package com.shop.telemetry.server.ingest.internal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.telemetry.server.grouping.StacktraceFingerprinter;
import com.shop.telemetry.server.ingest.NormalizedEvent;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * 归一化 + 分组是整条链路里唯一"错了会污染历史"的两段（改算法就得回填），所以只在这里
 * 压测试。夹具直接用 {@code telemetry/proto/fixtures} 的真实样本——两端各一份，
 * 因为浏览器和 Java 的 event 结构本来就不同。
 */
class EventNormalizerTest {

    private static final Instant NOW = Instant.parse("2026-10-30T12:00:00Z");

    private final EventNormalizer normalizer = new EventNormalizer(JsonMapper.builder().build());
    private final StacktraceFingerprinter fingerprinter = new StacktraceFingerprinter();

    @Test
    void normalizesBrowserEvent() throws IOException {
        NormalizedEvent normalized = normalizeOk(fixture("browser-error.event.json"));

        assertEquals("9f2c1ab34d5e6f708192a3b4c5d6e7f8", normalized.event().eventId());
        assertEquals("javascript", normalized.event().platform());
        assertEquals("error", normalized.event().level());
        assertEquals("web@1.4.0", normalized.event().release());
        assertEquals("dev", normalized.event().environment());
        assertEquals("GET /checkout/:step", normalized.event().transaction());
        assertEquals("t_1001", normalized.event().tenantId());
        assertEquals("7c9e6679b1a24a3f8e5d0c1b2a394857", normalized.event().traceId());
        assertEquals("GET /checkout/:step", normalized.issue().culprit());
        assertTrue(normalized.issue().title().startsWith("TypeError: Cannot read properties"));
    }

    /** in_app 过滤：只有两帧是业务代码，react-dom 那一帧不进指纹。 */
    @Test
    void keepsOnlyInAppFramesWithoutLineNumbers() throws IOException {
        NormalizedEvent normalized = normalizeOk(fixture("browser-error.event.json"));
        List<String> frames = normalized.fingerprintInput().frames();

        assertEquals(2, frames.size());
        assertTrue(frames.getFirst().startsWith("src/features/checkout/summary.tsx#"));
        assertFalse(String.join("|", frames).contains("5073"), "行号必须被丢掉，否则改一行就分出一条新 issue");
    }

    @Test
    void normalizesJavaEventWithThreadsAndModuleFrames() throws IOException {
        NormalizedEvent normalized = normalizeOk(fixture("java-error.event.json"));

        assertEquals("java", normalized.event().platform());
        assertEquals("api@0.1.0", normalized.event().release());
        assertEquals("java.lang.IllegalStateException", normalized.fingerprintInput().exceptionType());
        assertEquals(2, normalized.fingerprintInput().frames().size());
        assertTrue(normalized.fingerprintInput().frames().getFirst().contains("InventoryReservation#reserve"));
        assertTrue(normalized.issue().title().startsWith("java.lang.IllegalStateException: 库存不足"));
    }

    /** 同一份 payload 两次归一化必须得到同一个指纹；行号不同也必须相同。 */
    @Test
    void fingerprintIsStableAndIgnoresLineNumbers() throws IOException {
        String payload = fixture("browser-error.event.json");
        String fingerprint = fingerprintOf(payload);
        assertEquals(fingerprint, fingerprintOf(payload));

        String shifted = payload.replace("\"colno\": 28371", "\"colno\": 28402");
        assertFalse(shifted.equals(payload), "夹具里的列号没被替换，测试失去意义");
        assertEquals(fingerprint, fingerprintOf(shifted));
    }

    @Test
    void explicitFingerprintWins() {
        String payload =
                """
                {"event_id":"0123456789abcdef0123456789abcdef","platform":"javascript","level":"error",
                 "fingerprint":["{{ default }}","checkout-total"],
                 "exception":{"values":[{"type":"TypeError","value":"x","stacktrace":{"frames":[]}}]}}
                """;

        NormalizedEvent normalized = normalizeOk(payload);
        String fingerprint = fingerprinter.fingerprint(normalized.fingerprintInput());

        assertEquals("explicit:checkout-total", fingerprint);
    }

    @Test
    void dropsUnparsablePayload() {
        NormalizeResult result = normalizer.normalize("1", "not-json", NOW);

        assertTrue(result instanceof NormalizeResult.Drop);
        assertEquals(EventNormalizer.REASON_UNPARSABLE, ((NormalizeResult.Drop) result).reason());
    }

    @Test
    void degradesWhenFieldsAreMissingInsteadOfDropping() {
        String payload = "{\"platform\":\"other\"}";

        NormalizedEvent normalized = normalizeOk(payload);

        assertEquals("error", normalized.event().level(), "缺失的 level 降级为 error，而不是丢弃这条事件");
        assertNull(normalized.event().release());
        assertNull(normalized.event().traceId());
        assertEquals("Unknown", normalized.issue().title());
        assertNotNull(normalized.event().eventId(), "缺 event_id 时服务端生成");
    }

    private NormalizedEvent normalizeOk(String payload) {
        NormalizeResult result = normalizer.normalize("1", payload, NOW);
        return ((NormalizeResult.Ok) result).event();
    }

    private String fingerprintOf(String payload) {
        return fingerprinter.fingerprint(normalizeOk(payload).fingerprintInput());
    }

    private static String fixture(String name) throws IOException {
        return Files.readString(Path.of("..", "proto", "fixtures", name));
    }
}
