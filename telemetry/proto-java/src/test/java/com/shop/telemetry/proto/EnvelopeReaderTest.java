package com.shop.telemetry.proto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class EnvelopeReaderTest {

    /** payload 里带换行是常态（堆栈、日志），按行切会错，按字节长度切才对。 */
    @Test
    void splitsItemsByByteLengthEvenWhenPayloadContainsNewlines() {
        String eventPayload = "{\"message\":\"boom\",\n\"extra\":\"line2\nline3\"}";
        String sessionPayload = "{\"sid\":\"abc\"}";
        String raw =
                "{\"event_id\":\"0123456789abcdef0123456789abcdef\",\"dsn\":\"http://k@h/1\"}\n"
                        + "{\"type\":\"event\",\"length\":" + bytes(eventPayload) + "}\n"
                        + eventPayload
                        + "\n"
                        + "{\"type\":\"session\",\"length\":" + bytes(sessionPayload) + "}\n"
                        + sessionPayload
                        + "\n";

        Envelope envelope = EnvelopeReader.read(raw.getBytes(StandardCharsets.UTF_8));

        assertEquals(
                "{\"event_id\":\"0123456789abcdef0123456789abcdef\",\"dsn\":\"http://k@h/1\"}",
                envelope.headerJson());
        assertEquals(2, envelope.items().size());
        assertEquals(eventPayload, envelope.items().get(0).payload());
        assertEquals(sessionPayload, envelope.items().get(1).payload());
    }

    @Test
    void toleratesCrLfLineEndings() {
        String payload = "{\"a\":1}";
        String raw = "{\"event_id\":\"x\"}\r\n{\"type\":\"event\",\"length\":" + bytes(payload) + "}\r\n" + payload;

        Envelope envelope = EnvelopeReader.read(raw.getBytes(StandardCharsets.UTF_8));

        assertEquals("{\"event_id\":\"x\"}", envelope.headerJson());
        assertEquals(payload, envelope.items().getFirst().payload());
    }

    @Test
    void rejectsItemWithoutLength() {
        String raw = "{\"event_id\":\"x\"}\n{\"type\":\"event\"}\n{}";

        assertThrows(IllegalArgumentException.class, () -> EnvelopeReader.read(raw.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void rejectsTruncatedPayload() {
        String raw = "{\"event_id\":\"x\"}\n{\"type\":\"event\",\"length\":999}\n{}";

        assertThrows(IllegalArgumentException.class, () -> EnvelopeReader.read(raw.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void rejectsEmptyEnvelope() {
        assertThrows(IllegalArgumentException.class, () -> EnvelopeReader.read(new byte[0]));
    }

    private static int bytes(String s) {
        return s.getBytes(StandardCharsets.UTF_8).length;
    }
}
