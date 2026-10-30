package com.shop.telemetry.server.ingest.internal;

import com.shop.telemetry.server.grouping.FingerprintInput;
import com.shop.telemetry.server.ingest.NormalizedEvent;
import com.shop.telemetry.server.issues.IssueEvent;
import com.shop.telemetry.server.shared.Ids;
import com.shop.telemetry.server.store.EventRecord;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * payload → 落库形状 + 分组输入。**纯函数**（除读时钟），是 M0 里最值得单测的一段。
 *
 * <p>三条刻意的取舍：
 *
 * <ol>
 *   <li>**缺字段一律降级，不丢弃**。采集端版本差异极大，一个缺 release 的事件仍然有价值；
 *       只有"不是 JSON 对象"才丢。
 *   <li>**分组只取 in_app 帧，且丢掉行号**。行号变一次就分出一个新 issue，是分组算法最常见的自伤；
 *       有 in_app 就用 in_app，没有才退回全部帧。
 *   <li>**显式 fingerprint 优先**。客户端说"这些归一条"，比任何启发式都可信。
 * </ol>
 */
@Component
public class EventNormalizer {

    static final String REASON_UNPARSABLE = "unparsable_event";

    private static final int TITLE_MAX = 200;

    private final ObjectMapper json;

    public EventNormalizer(ObjectMapper json) {
        this.json = json;
    }

    public NormalizeResult normalize(String projectId, String payload, Instant now) {
        JsonNode root;
        try {
            root = json.readTree(payload);
        } catch (RuntimeException e) {
            return new NormalizeResult.Drop(REASON_UNPARSABLE);
        }
        if (root == null || !root.isObject()) {
            return new NormalizeResult.Drop(REASON_UNPARSABLE);
        }

        String eventId = text(root, "event_id");
        if (!isHex(eventId, 32)) {
            eventId = Ids.newEventId();
        }
        Instant occurredAt = occurredAt(root, now);
        String transaction = text(root, "transaction");
        String release = text(root, "release");
        String tenantId = text(root.path("tags"), "tenant.id");
        JsonNode trace = root.path("contexts").path("trace");
        String traceId = hexOrNull(text(trace, "trace_id"), 32);
        String spanId = hexOrNull(text(trace, "span_id"), 16);
        List<String> frames = frames(root);
        String exceptionType = exceptionType(root);
        String title = title(root);
        String culprit = transaction != null ? transaction : frames.isEmpty() ? null : frames.getFirst();
        String level = text(root, "level");

        EventRecord event = new EventRecord(
                projectId,
                eventId,
                occurredAt,
                "event",
                level == null ? "error" : level,
                text(root, "platform"),
                release,
                text(root, "environment"),
                transaction,
                tenantId,
                traceId,
                spanId,
                null, // fingerprint 由 ingest 调 grouping 之后回填
                payload);

        IssueEvent issue = new IssueEvent(
                projectId, null, title, culprit, event.level(), release, tenantId, occurredAt);
        return new NormalizeResult.Ok(new NormalizedEvent(event, issue, new FingerprintInput(
                explicitFingerprint(root), exceptionType, frames, transaction)));
    }

    static Instant occurredAt(JsonNode root, Instant now) {
        JsonNode timestamp = root.path("timestamp");
        if (timestamp.isNumber()) {
            double seconds = timestamp.asDouble();
            // 客户端时钟可能乱来：晚于"现在 + 1 天"或非正数一律按到达时间算
            if (seconds > 0 && seconds < now.getEpochSecond() + 86_400) {
                return Instant.ofEpochMilli((long) (seconds * 1000));
            }
        }
        return now;
    }

    static String title(JsonNode root) {
        JsonNode values = root.path("exception").path("values");
        if (values.isArray() && values.size() > 0) {
            JsonNode last = values.get(values.size() - 1);
            String type = text(last, "type");
            String value = text(last, "value");
            if (type != null) {
                return truncate(value == null ? type : type + ": " + value);
            }
            if (value != null) {
                return truncate(value);
            }
        }
        String message = text(root, "message");
        if (message != null) {
            return truncate(message);
        }
        String transaction = text(root, "transaction");
        return truncate(transaction == null ? "Unknown" : transaction);
    }

    static String exceptionType(JsonNode root) {
        JsonNode values = root.path("exception").path("values");
        if (values.isArray() && values.size() > 0) {
            return text(values.get(values.size() - 1), "type");
        }
        return null;
    }

    /**
     * 归一化帧串，格式 {@code module 或 filename # function}，**不含行号/列号**。
     *
     * <p>顺序保持 Sentry 原样（最旧在前）：顺序本身也是"这是不同 bug"的信号，重排会让指纹不稳定。
     */
    static List<String> frames(JsonNode root) {
        JsonNode values = root.path("exception").path("values");
        List<String> inApp = new ArrayList<>();
        List<String> all = new ArrayList<>();
        if (!values.isArray()) {
            return all;
        }
        for (JsonNode value : values) {
            JsonNode frames = value.path("stacktrace").path("frames");
            if (!frames.isArray()) {
                continue;
            }
            for (JsonNode frame : frames) {
                String key = frameKey(frame);
                if (key == null) {
                    continue;
                }
                all.add(key);
                if (frame.path("in_app").asBoolean(false)) {
                    inApp.add(key);
                }
            }
        }
        return inApp.isEmpty() ? all : inApp;
    }

    static String frameKey(JsonNode frame) {
        String module = text(frame, "module");
        String filename = text(frame, "filename");
        String function = text(frame, "function");
        String where = module != null ? module : filename;
        if (where == null && function == null) {
            return null;
        }
        return (where == null ? "" : where) + "#" + (function == null ? "" : function);
    }

    /** Sentry 的 {@code fingerprint} 是数组，可含 {@code "{{ default }}"} 占位。 */
    static String explicitFingerprint(JsonNode root) {
        JsonNode fingerprint = root.path("fingerprint");
        if (!fingerprint.isArray()) {
            return null;
        }
        StringBuilder sb = new StringBuilder();
        for (JsonNode part : fingerprint) {
            String value = part.isString() ? part.asString() : null;
            if (value == null || value.isBlank() || "{{ default }}".equals(value.trim())) {
                continue;
            }
            if (!sb.isEmpty()) {
                sb.append('|');
            }
            sb.append(value.trim());
        }
        return sb.isEmpty() ? null : sb.toString();
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
        return isHex(value, length) ? value : null;
    }

    static boolean isHex(String value, int length) {
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

    private static String truncate(String value) {
        if (value == null) {
            return "Unknown";
        }
        return value.length() <= TITLE_MAX ? value : value.substring(0, TITLE_MAX) + "…";
    }
}
