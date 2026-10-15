package com.shop.platform.rum.service;

import com.shop.platform.rum.RumVocabulary;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/**
 * 单条事件的落点：把一条已经上了队列、也已经反序列化过的事件落到指标与日志上。
 *
 * <p><b>它存在的理由只有一个</b>：{@code error_fallback} 与 {@code api_contract_drift} 这两个信号
 * 此前只有发射端（`packages/monitoring` 的 `captureError` / `track`），没有落点——
 * 「按频次把兜底句升成 code」这条判据因此不成立。这里把它们落到**可查询的计数**上。
 *
 * <p>三件事刻意如此：
 *
 * <ol>
 *   <li><b>指标只放有界标签，句子只进日志。</b>observability.md 契约第 3 条：`user_id` / 原始 URL
 *       这类无界值去日志里按字段查。`error_fallback` 要指认「哪一句该升成 code」，而句子天然无界——
 *       所以指标是 {@code (app, source, status)}，句子在日志里。
 *   <li><b>白名单外的值折成 other 而不是丢弃。</b>丢了你连「有人在乱发」都看不到。
 *   <li><b>不吞异常。</b>它抛出去由消费端交给容器的错误处理器重试——吞掉的后果是
 *       「Redis 抖一下，那批事件静默消失」，而遥测恰恰要靠计数发现这种事。
 * </ol>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RumEventSink {

    private final RumVitals vitals;
    private final MeterRegistry registry;

    /**
     * @param app 分区键带上来的 app，**已由接收端过白名单**。这里再过一次是防御性的：
     *            它是标签值，而来路不止一条（将来可能有人直接调它）
     */
    public void accept(JsonNode event, String app) {
        String safeApp = RumVocabulary.label(RumVocabulary.APPS, app);
        String kind =
                RumVocabulary.label(RumVocabulary.KINDS, RumVocabulary.text(event, "kind", RumVocabulary.MAX_LABEL));
        Counter.builder("shop.rum.events")
                .tags("app", safeApp, "kind", kind)
                .register(registry)
                .increment();

        switch (kind) {
            case "error" -> acceptError(event, safeApp);
            case "fallback" -> acceptFallback(event, safeApp);
            case "performance" -> vitals.accept(event, safeApp);
            // api / route 暂时仍只计总量。
            default -> {}
        }
    }

    private void acceptError(JsonNode event, String app) {
        String name = RumVocabulary.label(
                RumVocabulary.ERROR_NAMES, RumVocabulary.text(event, "name", RumVocabulary.MAX_LABEL));
        Counter.builder("shop.rum.errors")
                .tags("app", app, "name", name)
                .register(registry)
                .increment();
        // 指纹与栈进日志：它们是排查的入口，而基数不允许进标签
        log.warn(
                "[RUM] 前端错误 app={} name={} route={} version={} message={} fingerprint={} stack={}",
                app,
                name,
                RumVocabulary.text(event, "route", RumVocabulary.MAX_LABEL),
                RumVocabulary.text(event, "version", RumVocabulary.MAX_LABEL),
                RumVocabulary.text(event, "message", RumVocabulary.MAX_MESSAGE),
                RumVocabulary.text(event, "fingerprint", RumVocabulary.MAX_MESSAGE),
                RumVocabulary.text(event, "stack", RumVocabulary.MAX_STACK));
    }

    /**
     * 文案兜底：**「哪句 detail 该升成 code」唯一的数据源**。
     *
     * <p>指标是 {@code (app, source, status)}——有界，用来找量；句子进日志，用来指认是哪句。
     * 升级动作落在某一句上，所以两者缺一不可。
     */
    private void acceptFallback(JsonNode event, String app) {
        String source = RumVocabulary.label(
                RumVocabulary.FALLBACK_SOURCES, RumVocabulary.text(event, "source", RumVocabulary.MAX_LABEL));
        String status = RumVocabulary.statusLabel(RumVocabulary.intValue(event, "status"));
        Counter.builder("shop.rum.fallback")
                .tags("app", app, "source", source, "status", status)
                .register(registry)
                .increment();
        log.warn(
                "[RUM] 文案兜底 app={} source={} status={} code={} route={} detail={}",
                app,
                source,
                status,
                RumVocabulary.text(event, "code", RumVocabulary.MAX_LABEL),
                RumVocabulary.text(event, "route", RumVocabulary.MAX_LABEL),
                RumVocabulary.text(event, "detail", RumVocabulary.MAX_DETAIL));
    }
}
