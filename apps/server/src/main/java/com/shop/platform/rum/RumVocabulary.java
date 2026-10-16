package com.shop.platform.rum;

import java.time.Duration;
import java.util.Set;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;

/**
 * 前端遥测接收端的词表与上限：**「什么东西有资格进指标标签」的唯一出口**。
 *
 * <p>为什么单独一个类而不是散在 {@link com.shop.platform.rum.service.RumIngestService} 里：这个接口**匿名可达**，字段值全部
 * 来自客户端，而 Prometheus 的标签基数是硬约束（observability.md 契约第 3 条）——
 * 一个能自由决定标签值的匿名接口等于给了一条撑爆时序库的路。所以每个进标签的值都必须先过
 * 白名单，白名单外的统一折成 {@code other}（不是丢弃：丢了你连「有人在乱发」都看不到）。
 *
 * <p>{@link #ERROR_NAMES} 与前端 {@code packages/monitoring/src/types.ts} 的 {@code ErrorName}
 * 联合类型必须**两向相等**，由 {@code RumVocabularyTest} 扫源码核对——两边各写一份而不核，
 * 漂了的症状是「某类错误在指标里静静地全归到 other」，没有任何报错。
 */
public final class RumVocabulary {

    private RumVocabulary() {}

    /** 白名单外的一切折成它。用 {@code other} 而不是丢掉：乱发的量本身就是信号 */
    public static final String OTHER = "other";

    /**
     * 信封版本，与前端 {@code packages/monitoring/src/envelope.ts} 的 {@code EnvelopeSchema} 两向相等
     * （由 {@code RumVocabularyTest} 扫源码核）。
     *
     * <p>它存在的意义是**改版之后老数据还按老 schema 查**——所以接收端必须认得它，而不是只当个
     * 没人读的字段。不认识的信封不丢、只计数（理由见 {@code RumEventConsumer}）：
     * 前端先发版、后端后发版的那个窗口里，丢掉等于在最需要现场的时候把现场关掉。
     */
    public static final String SCHEMA = "shop.fe.v1";

    public static final Set<String> VITAL_NAMES = Set.of("LCP", "INP", "CLS");
    public static final Set<String> VIEWPORTS = Set.of("small", "large", "unknown");
    public static final Pattern VITAL_ID = Pattern.compile("[A-Za-z0-9_-]{1,128}");
    public static final Duration VITAL_DEDUP_TTL = Duration.ofHours(1);
    /** 超出浏览器性能分析范围的匿名输入拒收，不截成一个假的正常值。 */
    public static final long MAX_VITAL_MILLIS = 300_000;

    public static final double MAX_CLS = 100;

    public static final Set<String> APPS = Set.of("web", "seller", "admin");

    /** 事件种类，与前端 {@code MonitoringEvent} 联合类型的判别值一致 */
    public static final Set<String> KINDS = Set.of("error", "performance", "api", "route", "fallback");

    /** 与前端 {@code ErrorName} 联合类型两向相等（由 RumVocabularyTest 核） */
    public static final Set<String> ERROR_NAMES = Set.of(
            "js_error",
            "unhandled_rejection",
            "route_error",
            "hydration_error",
            "blank_screen",
            "api_contract_drift",
            "i18n_missing_key",
            "i18n_missing_param",
            "i18n_invalid_message",
            "resource_load_error",
            "custom");

    /** 文案兜底的两支，与前端 {@code MonitorFallbackEvent.source} 一致 */
    public static final Set<String> FALLBACK_SOURCES = Set.of("detail", "status");

    /**
     * 单批事件数上限。发送端一批最多 50（`transport.ts` 的 MAX_BATCH，受 beacon 配额约束），
     * 这里留一倍余量：正常客户端永远撞不到，撞到的就是手工构造的请求。
     */
    public static final int MAX_BATCH = 100;

    /** 单个字符串字段的截断宽度。客户端可控，不截就是让对方决定我们的日志与存储体积 */
    public static final int MAX_MESSAGE = 500;

    public static final int MAX_STACK = 4000;
    public static final int MAX_DETAIL = 300;
    public static final int MAX_LABEL = 64;

    /**
     * 单 IP 每分钟的批次数上限。
     *
     * <p>量级按发送端算：攒到 20 条发一次 + 30 秒心跳一次 + 转后台 flush 一次，一个活跃标签页
     * 一分钟最多几条。120 是给「一个 NAT 出口后面整个办公室」留的余量，不是给单标签页的。
     */
    public static final int RATE_MAX_PER_MINUTE = 120;

    /** 白名单过滤：不在名单里（含 null）一律折成 {@link #OTHER} */
    public static String label(Set<String> allowed, String raw) {
        return raw != null && allowed.contains(raw) ? raw : OTHER;
    }

    /**
     * HTTP 状态码进标签：0（网络层失败）与 1xx~5xx 照实，其余折成 other。
     *
     * <p>不直接用整数是因为它是**客户端给的**：不限域就等于允许对方造出 2^31 个标签值。
     * 600 个界内值是可控基数，而这个数正是排查时最想看的维度之一。
     */
    public static String statusLabel(int status) {
        return status >= 0 && status <= 599 ? String.valueOf(status) : OTHER;
    }

    /** 截断超长字符串；null 原样返回 */
    public static String clip(String value, int max) {
        if (value == null || value.length() <= max) {
            return value;
        }
        return value.substring(0, max);
    }

    /** 取一个字符串字段并截断。**非字符串一律当不存在**（客户端可以给任何类型，包括对象与数组） */
    public static String text(JsonNode event, String field, int max) {
        JsonNode node = event.path(field);
        return node.isString() ? clip(node.asString(), max) : null;
    }

    /** 取一个整数字段；缺失或不是数字一律当 0——0 表示网络层失败，它本身就是个合法取值 */
    public static int intValue(JsonNode event, String field) {
        JsonNode node = event.path(field);
        return node.isNumber() ? node.asInt() : 0;
    }
}
