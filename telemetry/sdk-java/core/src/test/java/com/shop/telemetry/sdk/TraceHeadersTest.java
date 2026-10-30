package com.shop.telemetry.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class TraceHeadersTest {

    private static final String TRACE_ID = "0123456789abcdef0123456789abcdef";
    private static final String PARENT_SPAN = "89abcdef01234567";

    @Test
    void continuesInboundTraceInsteadOfStartingANewOne() {
        TraceContext context = TraceHeaders.inbound(TRACE_ID + "-" + PARENT_SPAN + "-1", null, "pk");

        assertEquals(TRACE_ID, context.traceId());
        assertEquals(PARENT_SPAN, context.parentSpanId());
        // 本段 span 必须新生成：入站那个是上一跳的，拿来当自己的会让链路图变平
        assertNotEquals(PARENT_SPAN, context.spanId());
        assertEquals(16, context.spanId().length());
        assertTrue(context.sampled());
    }

    @Test
    void startsNewTraceWhenHeaderIsMissingOrMalformed() {
        for (String header : new String[] {null, "", "garbage", "abc-def-1"}) {
            TraceContext context = TraceHeaders.inbound(header, null, "pk");

            assertEquals(32, context.traceId().length());
            assertNull(context.parentSpanId());
            assertFalse(context.sampled());
        }
    }

    /** 上游已决策就必须继承，否则上游采了、下游没采，链路断了。 */
    @Test
    void inheritsSamplingDecisionFromBaggage() {
        TraceContext context = TraceHeaders.inbound(
                TRACE_ID + "-" + PARENT_SPAN, "sentry-sampled=1,sentry-release=web@1.2.3", "pk");

        assertTrue(context.sampled());
        assertEquals("web@1.2.3", context.release());
    }

    @Test
    void roundTripsThroughHeaders() {
        TraceContext original = new TraceContext(TRACE_ID, "1111222233334444", null, true, "pk", "api@0.1.0", "dev");

        TraceContext parsed = TraceHeaders.inbound(
                TraceHeaders.toSentryTrace(original), TraceHeaders.toBaggage(original), "pk");

        assertEquals(TRACE_ID, parsed.traceId());
        assertEquals("1111222233334444", parsed.parentSpanId());
        assertTrue(parsed.sampled());
        assertEquals("api@0.1.0", parsed.release());
        assertEquals("dev", parsed.environment());
    }
}
