package com.shop.telemetry.server.trace;

import com.shop.telemetry.server.store.StoredEvent;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 把"同一个 trace_id 的一堆事件"拼成一棵树。**纯函数**（除解析 JSON），是最值得单测的一段。
 *
 * <p>跨端是怎么连上的：浏览器事务里的一个 {@code http.client} span 有 span_id，
 * 它被写进发给后端的 {@code sentry-trace} 头；后端的根 span 把那个 id 当作 parent_span_id。
 * 于是两个**互不相识的进程**，只要各自正确填了三个 id，就能被这里拼成一棵树。
 * 采集平台的全部作用就是如实还原这件事——不猜、不补、不按时间硬连。
 *
 * <p>四条刻意的取舍：
 *
 * <ol>
 *   <li>**父不存在就是根**。事件乱序、上一段没采到、跨天清理掉了父节点，都会出现孤儿子树。
 *       把它提到顶层显示，比丢掉好：能看到"这里断了一截"本身就有信息量。
 *   <li>**环要能活下来**。客户端可以伪造 span_id/parent_span_id 让父子互指，
 *       递归实现会栈溢出（一个请求打崩整个 api 进程）。所以用显式栈 + visited 集合。
 *   <li>**排序按 startedAt 升序**。同一条 trace 内相对顺序是可信的（同一台机器/同一段代码），
 *       而跨事件列表不能按 received_at 排（网络乱序）。
 *   <li>**节点数有上限**。畸形 payload 里的 spans 数组可以塞几十万个元素，
 *       这是最省力的内存打爆方式。
 * </ol>
 */
@Component
public class TraceTreeBuilder {

    /** 单条 trace 的节点上限。Sentry 自己对单个事务的 span 数上限是 1000。 */
    private static final int MAX_NODES = 5000;

    private final ObjectMapper json;

    public TraceTreeBuilder(ObjectMapper json) {
        this.json = json;
    }

    public TraceGraph build(String traceId, List<StoredEvent> events) {
        Map<String, Node> nodes = new LinkedHashMap<>();
        for (StoredEvent stored : events) {
            if (nodes.size() >= MAX_NODES) {
                break;
            }
            JsonNode payload = parse(stored.event().payload());
            if (payload == null) {
                continue;
            }
            JsonNode trace = payload.path("contexts").path("trace");
            String spanId = hex(text(trace, "span_id"), 16);
            if (spanId == null) {
                continue;
            }
            switch (stored.event().kind()) {
                case "transaction" -> collectTransaction(nodes, stored, payload, trace, spanId);
                case "event" -> nodes.putIfAbsent(spanId, errorNode(stored, payload, trace, spanId));
                default -> {
                    // session / check_in / client_report 不是链上的节点
                }
            }
        }
        if (nodes.isEmpty()) {
            return new TraceGraph(traceId, Instant.now(), 0, List.of(), 0, List.of());
        }

        Instant base = nodes.values().stream().map(Node::startedAt).min(Comparator.naturalOrder()).orElseThrow();
        Map<String, List<Node>> children = childrenByParent(nodes);
        List<TraceSpan> flat = new ArrayList<>(nodes.size());
        Set<String> visited = new HashSet<>();
        for (Node root : roots(nodes)) {
            flatten(root, children, visited, flat, base);
        }
        // 环：DFS 之后仍没被访问到的节点（父子互指/自指）。宁可平铺显示，也不让它消失
        nodes.values().stream()
                .filter(node -> !visited.contains(node.spanId()))
                .sorted(BY_START)
                .forEach(node -> flatten(node, children, visited, flat, base));

        Instant endsAt = nodes.values().stream()
                .map(Node::endedAt)
                .max(Comparator.<Instant>naturalOrder())
                .orElse(base);
        long durationMs = Math.max(0, Duration.between(base, endsAt).toMillis());
        List<String> services = new ArrayList<>(new LinkedHashSet<>(
                flat.stream().map(TraceSpan::service).filter(service -> service != null).toList()));
        int errorCount = (int) flat.stream().filter(span -> "error".equals(span.kind())).count();
        return new TraceGraph(traceId, base, durationMs, services, errorCount, flat);
    }

    private void collectTransaction(
            Map<String, Node> nodes, StoredEvent stored, JsonNode payload, JsonNode trace, String spanId) {
        Instant startedAt = timestamp(payload, "start_timestamp");
        if (startedAt == null) {
            startedAt = stored.event().occurredAt();
        }
        Instant endedAt = timestamp(payload, "timestamp");
        if (endedAt == null || endedAt.isBefore(startedAt)) {
            endedAt = startedAt;
        }
        // server_name 是 sentry-java 的 setServerName 落点：后端事务只带它、不带 tags.service.name
        String service = firstNonNull(
                text(payload.path("tags"), "service.name"),
                text(payload, "server_name"),
                stored.event().platform(),
                "unknown");
        // payload 优先、提升列兜底：两者本是同源，但读路径上"原文是唯一事实"这条更值得守
        String name = firstNonNull(text(payload, "transaction"), stored.event().transaction(), "transaction");
        nodes.putIfAbsent(
                spanId,
                new Node(
                        spanId,
                        hex(text(trace, "parent_span_id"), 16),
                        "transaction",
                        firstNonNull(text(trace, "op"), "transaction"),
                        name,
                        service,
                        name,
                        text(trace, "status"),
                        startedAt,
                        endedAt,
                        null,
                        null));

        JsonNode spans = payload.path("spans");
        if (!spans.isArray()) {
            return;
        }
        for (JsonNode span : spans) {
            if (nodes.size() >= MAX_NODES) {
                return;
            }
            String childSpanId = hex(text(span, "span_id"), 16);
            if (childSpanId == null || nodes.containsKey(childSpanId)) {
                continue;
            }
            Instant childStart = timestamp(span, "start_timestamp");
            if (childStart == null) {
                continue; // 没有起点就画不出时间条，也无法排序
            }
            Instant childEnd = timestamp(span, "timestamp");
            if (childEnd == null) {
                childEnd = timestamp(span, "end_timestamp");
            }
            if (childEnd == null || childEnd.isBefore(childStart)) {
                childEnd = childStart;
            }
            nodes.put(
                    childSpanId,
                    new Node(
                            childSpanId,
                            hex(text(span, "parent_span_id"), 16),
                            "span",
                            text(span, "op"),
                            firstNonNull(text(span, "description"), text(span, "op"), "<unknown>"),
                            service, // span 属于产生它的事务所在的服务
                            name,
                            text(span, "status"),
                            childStart,
                            childEnd,
                            null,
                            null));
        }
    }

    /** 错误事件也挂进树：它的父 span 就是"出错那一刻正在做的事"，这是 trace 视图最值钱的一格信息。 */
    private Node errorNode(StoredEvent stored, JsonNode payload, JsonNode trace, String spanId) {
        Instant at = stored.event().occurredAt();
        // server_name 是 sentry-java 的 setServerName 落点：后端事务只带它、不带 tags.service.name
        String service = firstNonNull(
                text(payload.path("tags"), "service.name"),
                text(payload, "server_name"),
                stored.event().platform(),
                "unknown");
        return new Node(
                spanId,
                hex(text(trace, "parent_span_id"), 16),
                "error",
                // op 固定为 error：错误事件的 trace.op 是"它掉在哪个 span 里"，而这件事
                // 已经由层级表达了。原样显示会出现两层一模一样的 ui.render。
                "error",
                title(payload),
                service,
                stored.event().transaction(),
                firstNonNull(stored.event().level(), "error"),
                at,
                at,
                stored.id(),
                firstNonNull(stored.event().level(), "error"));
    }

    private static List<Node> roots(Map<String, Node> nodes) {
        List<Node> roots = new ArrayList<>();
        for (Node node : nodes.values()) {
            String parent = node.parentSpanId();
            if (parent == null || parent.equals(node.spanId()) || !nodes.containsKey(parent)) {
                roots.add(node);
            }
        }
        roots.sort(BY_START);
        return roots;
    }

    private static Map<String, List<Node>> childrenByParent(Map<String, Node> nodes) {
        Map<String, List<Node>> children = new HashMap<>();
        for (Node node : nodes.values()) {
            String parent = node.parentSpanId();
            if (parent == null || parent.equals(node.spanId())) {
                continue;
            }
            children.computeIfAbsent(parent, key -> new ArrayList<>()).add(node);
        }
        children.values().forEach(list -> list.sort(BY_START));
        return children;
    }

    /**
     * 显式栈的 DFS：深度由客户端决定，递归实现能被一个畸形 payload 打成 StackOverflowError，
     * 而 StackOverflowError 是 Error 不是 Exception——worker/api 线程会直接死掉。
     */
    private static void flatten(
            Node root, Map<String, List<Node>> children, Set<String> visited, List<TraceSpan> out, Instant base) {
        record Frame(Node node, int depth) {}
        Deque<Frame> stack = new ArrayDeque<>();
        stack.push(new Frame(root, 0));
        while (!stack.isEmpty()) {
            Frame frame = stack.pop();
            Node node = frame.node();
            if (!visited.add(node.spanId())) {
                continue; // 环或重复 id
            }
            out.add(new TraceSpan(
                    node.spanId(),
                    node.parentSpanId(),
                    frame.depth(),
                    node.kind(),
                    node.op(),
                    node.description(),
                    node.service(),
                    node.transaction(),
                    node.status(),
                    Math.max(0, Duration.between(base, node.startedAt()).toMillis()),
                    Math.max(0, Duration.between(node.startedAt(), node.endedAt()).toMillis()),
                    node.level(),
                    node.eventId()));
            List<Node> kids = children.getOrDefault(node.spanId(), List.of());
            // 逆序压栈，弹出时才是按起点升序
            for (int i = kids.size() - 1; i >= 0; i--) {
                stack.push(new Frame(kids.get(i), frame.depth() + 1));
            }
        }
    }

    private JsonNode parse(String payload) {
        try {
            JsonNode node = json.readTree(payload);
            return node != null && node.isObject() ? node : null;
        } catch (RuntimeException e) {
            return null; // 原文存了但不是 JSON（不认识的 kind 走 storeRaw 时会这样）
        }
    }

    /** 错误节点的文字：优先异常类型+消息，其次 message，最后事务名。与 issue 标题同源。 */
    private static String title(JsonNode payload) {
        JsonNode values = payload.path("exception").path("values");
        if (values.isArray() && values.size() > 0) {
            JsonNode last = values.get(values.size() - 1);
            String type = text(last, "type");
            String value = text(last, "value");
            if (type != null) {
                return value == null ? type : type + ": " + value;
            }
            if (value != null) {
                return value;
            }
        }
        return firstNonNull(text(payload, "message"), text(payload, "transaction"), "error");
    }

    private static Instant timestamp(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (!value.isNumber()) {
            return null;
        }
        double seconds = value.asDouble();
        return seconds <= 0 ? null : Instant.ofEpochMilli((long) (seconds * 1000));
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

    private static String hex(String value, int length) {
        if (value == null || value.length() != length) {
            return null;
        }
        for (int i = 0; i < length; i++) {
            char c = Character.toLowerCase(value.charAt(i));
            if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) {
                return null;
            }
        }
        return value.toLowerCase(java.util.Locale.ROOT);
    }

    private static String firstNonNull(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private static final Comparator<Node> BY_START = Comparator.comparing(Node::startedAt);

    /** 解析中间态：树形关系还没定，先收集。 */
    private record Node(
            String spanId,
            String parentSpanId,
            String kind,
            String op,
            String description,
            String service,
            String transaction,
            String status,
            Instant startedAt,
            Instant endedAt,
            Long eventId,
            String level) {}
}
