package com.shop.platform.infra.web;

import com.shop.platform.infra.security.RateLimiter;
import io.micrometer.core.instrument.Metrics;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 前端遥测（RUM）接收端的用例。接口本身只有一行转发，重量都在这里。
 *
 * <p><b>它存在的理由只有一个</b>：{@code error_fallback} 与 {@code api_contract_drift} 这两个信号
 * 此前只有发射端（`packages/monitoring` 的 `captureError` / `track`），没有接收端——
 * 「按频次把兜底句升成 code」这条判据因此不成立，N3 说的「后端悄悄改了字段，机器当场叫」
 * 也只在测试期成立。这里把它们落到**可查询的计数**上。
 *
 * <p>三条口径，每条都对应一个具体的坑：
 *
 * <ol>
 *   <li><b>不信任客户端。</b>接口匿名可达，字段值全来自请求体。进指标标签的每个值先过
 *       {@link RumVocabulary} 白名单，超长字符串一律截断——否则一条请求就能造出无界基数
 *       或几十 MB 的日志行。
 *   <li><b>永不 5xx，永不抛。</b>遥测的失败不能变成客户端的失败，更不能进错误日志面把真故障淹掉。
 *       Redis 挂了（限流查不动）一律当作「不限流」放行，宁可多收也不能因为监控设施不可用而 500。
 *   <li><b>指标只放有界标签，句子只进日志。</b>observability.md 契约第 3 条：`user_id` / 原始 URL
 *       这类无界值去日志里按字段查。`error_fallback` 要指认「哪一句该升成 code」，而句子天然无界——
 *       所以指标是 {@code (app, source, status)}，句子在日志里。
 * </ol>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RumEventIngest {

    private final ObjectMapper objectMapper;
    private final StringRedisTemplate redis;
    private final RumVitals vitals;

    /** 入口。任何异常都不外抛——见类注释第 2 条 */
    public void ingest(String body, String clientIp) {
        try {
            if (rateLimited(clientIp)) {
                return;
            }
            JsonNode batch = objectMapper.readTree(body);
            if (batch == null || !batch.isArray()) {
                rejected("not_array");
                return;
            }
            if (batch.size() > RumVocabulary.MAX_BATCH) {
                rejected("batch_too_large");
                return;
            }
            batch.forEach(this::accept);
        } catch (Exception ex) {
            // 解析失败、Redis 抛错、任何意外：计一条 rejected 就够了，不打堆栈（对方的解析失败不是我们的故障）
            rejected("bad_body");
        }
    }

    /** 单条事件：校验 → 计数 → （仅错误与兜底）进日志 */
    private void accept(JsonNode event) {
        if (!event.isObject()) {
            rejected("not_object");
            return;
        }
        String app = RumVocabulary.label(RumVocabulary.APPS, text(event, "app", RumVocabulary.MAX_LABEL));
        String kind = RumVocabulary.label(RumVocabulary.KINDS, text(event, "kind", RumVocabulary.MAX_LABEL));
        Metrics.counter("shop.rum.events", "app", app, "kind", kind).increment();

        switch (kind) {
            case "error" -> acceptError(event, app);
            case "fallback" -> acceptFallback(event, app);
            case "performance" -> vitals.accept(event, app);
            // api / route 暂时仍只计总量。
            default -> {}
        }
    }

    private void acceptError(JsonNode event, String app) {
        String name = RumVocabulary.label(RumVocabulary.ERROR_NAMES, text(event, "name", RumVocabulary.MAX_LABEL));
        Metrics.counter("shop.rum.errors", "app", app, "name", name).increment();
        // 指纹与栈进日志：它们是排查的入口，而基数不允许进标签
        log.warn(
                "[RUM] 前端错误 app={} name={} route={} version={} message={} fingerprint={} stack={}",
                app,
                name,
                text(event, "route", RumVocabulary.MAX_LABEL),
                text(event, "version", RumVocabulary.MAX_LABEL),
                text(event, "message", RumVocabulary.MAX_MESSAGE),
                text(event, "fingerprint", RumVocabulary.MAX_MESSAGE),
                text(event, "stack", RumVocabulary.MAX_STACK));
    }

    /**
     * 文案兜底：**「哪句 detail 该升成 code」唯一的数据源**（error-codes.md 判据的第二半）。
     *
     * <p>指标是 {@code (app, source, status)}——有界，用来找量；句子进日志，用来指认是哪句。
     * 升级动作落在某一句上，所以两者缺一不可。
     */
    private void acceptFallback(JsonNode event, String app) {
        String source =
                RumVocabulary.label(RumVocabulary.FALLBACK_SOURCES, text(event, "source", RumVocabulary.MAX_LABEL));
        String status = RumVocabulary.statusLabel(intValue(event, "status"));
        Metrics.counter("shop.rum.fallback", "app", app, "source", source, "status", status)
                .increment();
        log.warn(
                "[RUM] 文案兜底 app={} source={} status={} code={} route={} detail={}",
                app,
                source,
                status,
                text(event, "code", RumVocabulary.MAX_LABEL),
                text(event, "route", RumVocabulary.MAX_LABEL),
                text(event, "detail", RumVocabulary.MAX_DETAIL));
    }

    /**
     * 限流。**查询本身失败一律放行**（fail-open）：监控设施不可用时拒收遥测，
     * 等于在最需要现场的时候把现场关掉。
     */
    private boolean rateLimited(String clientIp) {
        if (clientIp == null || clientIp.isBlank()) {
            return false;
        }
        try {
            if (RateLimiter.exceeded(
                    redis, "rum:ip:" + clientIp, RumVocabulary.RATE_MAX_PER_MINUTE, Duration.ofMinutes(1))) {
                rejected("ip_rate_limited");
                return true;
            }
        } catch (Exception ex) {
            // Redis 不可用：放行。不记 rejected——那是「客户端违规」的计数，混进来会误导
            return false;
        }
        return false;
    }

    private static void rejected(String reason) {
        Metrics.counter("shop.rum.rejected", "reason", reason).increment();
    }

    private static String text(JsonNode event, String field, int max) {
        JsonNode node = event.path(field);
        return node.isString() ? RumVocabulary.clip(node.asString(), max) : null;
    }

    /** 取整数；缺失或不是数字一律当 0（= 网络层失败），它本身就是个合法取值 */
    private static int intValue(JsonNode event, String field) {
        JsonNode node = event.path(field);
        return node.isNumber() ? node.asInt() : 0;
    }
}
