package com.shop.telemetry.sdk;

import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * {@code sentry-trace} 与 {@code baggage} 的解析与生成。
 *
 * <p>两个头分工不同，都需要：
 *
 * <ul>
 *   <li>{@code sentry-trace: traceId-spanId-sampled} —— 链路本身
 *   <li>{@code baggage: sentry-trace_id=...,sentry-sampled=1,...} —— 采样决策与元数据，
 *       兼容 W3C Baggage，所以别的追踪系统也能读
 * </ul>
 *
 * <p>为什么采样决策要跟着请求走，而不是每个节点自己掷骰子：独立随机采样会把链路采断——
 * 上游采了、下游没采，就得到一棵缺了半边的树，比没有更难查。
 */
public final class TraceHeaders {

    public static final String SENTRY_TRACE = "sentry-trace";
    public static final String BAGGAGE = "baggage";

    private static final SecureRandom RANDOM = new SecureRandom();

    private TraceHeaders() {}

    /** 等价于 {@code inbound(..., false)}：没有上游决策时默认不采。 */
    public static TraceContext inbound(String sentryTrace, String baggage, String publicKey) {
        return inbound(sentryTrace, baggage, publicKey, false);
    }

    /**
     * 入站解析。缺头、头非法、或只有一半时都降级成"新起一条链路"，绝不抛异常——
     * 采集系统自己不能成为业务请求的失败原因。
     *
     * @param fallbackSampled **只有上游完全没给决策时**才用得上（直接调后端、脚本、健康检查）。
     *     掷骰子必须由调用方做完传进来：采样率是配置，解析函数不该知道它，更不该自己调
     *     {@code Random}（那样同一个请求解析两次会得到不同答案）。
     */
    public static TraceContext inbound(
            String sentryTrace, String baggage, String publicKey, boolean fallbackSampled) {
        Map<String, String> bag = parseBaggage(baggage);
        String traceId = null;
        String parentSpanId = null;
        Boolean sampled = null;

        if (sentryTrace != null && !sentryTrace.isBlank()) {
            String[] parts = sentryTrace.trim().split("-");
            if (parts.length >= 2 && isHex(parts[0], 32) && isHex(parts[1], 16)) {
                traceId = parts[0];
                parentSpanId = parts[1];
                // 头非法时连同采样标记一起丢掉：一个坏 trace_id 旁边的 "-1" 不该被当真
                if (parts.length >= 3) {
                    sampled = "1".equals(parts[2]) ? Boolean.TRUE : "0".equals(parts[2]) ? Boolean.FALSE : null;
                }
            }
        }
        if (traceId == null) {
            String fromBaggage = bag.get("sentry-trace_id");
            traceId = isHex(fromBaggage, 32) ? fromBaggage : randomHex(16);
        }
        if (sampled == null) {
            String fromBaggage = bag.get("sentry-sampled");
            sampled = fromBaggage == null ? fallbackSampled : "1".equals(fromBaggage);
        }

        return new TraceContext(
                traceId,
                randomHex(8),
                parentSpanId,
                sampled,
                publicKey != null ? publicKey : bag.getOrDefault("sentry-public_key", ""),
                bag.get("sentry-release"),
                bag.get("sentry-environment"));
    }

    /** 出站/回写用的 {@code sentry-trace}，带的是**本段** span，下游据此把父节点指向我们。 */
    public static String toSentryTrace(TraceContext context) {
        return context.traceId() + "-" + context.spanId() + "-" + (context.sampled() ? "1" : "0");
    }

    /** 出站 {@code baggage}。顺序固定，便于测试与排查时肉眼比对。 */
    public static String toBaggage(TraceContext context) {
        Map<String, String> entries = new LinkedHashMap<>();
        entries.put("sentry-trace_id", context.traceId());
        entries.put("sentry-public_key", context.publicKey() == null ? "" : context.publicKey());
        entries.put("sentry-sampled", context.sampled() ? "1" : "0");
        if (context.release() != null) {
            entries.put("sentry-release", context.release());
        }
        if (context.environment() != null) {
            entries.put("sentry-environment", context.environment());
        }
        StringBuilder sb = new StringBuilder();
        entries.forEach((k, v) -> {
            if (!sb.isEmpty()) {
                sb.append(',');
            }
            sb.append(k).append('=').append(v);
        });
        return sb.toString();
    }

    private static Map<String, String> parseBaggage(String baggage) {
        Map<String, String> result = new LinkedHashMap<>();
        if (baggage == null || baggage.isBlank()) {
            return result;
        }
        for (String entry : baggage.split(",")) {
            int eq = entry.indexOf('=');
            if (eq <= 0) {
                continue;
            }
            // W3C baggage 允许 "key=value;metadata"，元数据对决策无意义，丢掉
            String value = entry.substring(eq + 1);
            int semi = value.indexOf(';');
            result.put(entry.substring(0, eq).trim(), semi < 0 ? value.trim() : value.substring(0, semi).trim());
        }
        return result;
    }

    private static boolean isHex(String value, int length) {
        if (value == null || value.length() != length) {
            return false;
        }
        for (int i = 0; i < length; i++) {
            char c = value.charAt(i);
            boolean hex = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
            if (!hex) {
                return false;
            }
        }
        return true;
    }

    private static String randomHex(int bytes) {
        byte[] buffer = new byte[bytes];
        RANDOM.nextBytes(buffer);
        return HexFormat.of().formatHex(buffer);
    }
}
