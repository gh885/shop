package com.shop.platform.infra.web;

import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/** 导航级 Web Vitals 的有界直方图；不把用户、路由、版本或 metricId 放进标签。 */
@Component
@RequiredArgsConstructor
public class RumVitals {
    private final StringRedisTemplate redis;
    private final MeterRegistry registry;

    public void accept(JsonNode event, String app) {
        String name = event.path("name").asString("");
        String viewport = event.path("viewport").asString("");
        String metricId = event.path("metricId").asString("");
        JsonNode rawValue = event.path("value");
        if (!RumVocabulary.APPS.contains(app)
                || !RumVocabulary.VITAL_NAMES.contains(name)
                || !RumVocabulary.VIEWPORTS.contains(viewport)
                || !event.path("metricId").isString()
                || !RumVocabulary.VITAL_ID.matcher(metricId).matches()
                || !rawValue.isNumber()) {
            discard("invalid_vital");
            return;
        }
        double value = rawValue.asDouble();
        double maximum = name.equals("CLS") ? RumVocabulary.MAX_CLS : RumVocabulary.MAX_VITAL_MILLIS;
        if (!Double.isFinite(value) || value < 0 || value > maximum) {
            discard("invalid_vital");
            return;
        }

        // SET NX + TTL 跨实例去重。先确认去重成功再落桶；Redis 不可用时丢本条，不污染分布。
        try {
            Boolean first = redis.opsForValue()
                    .setIfAbsent("rum:vital:" + app + ":" + name + ":" + metricId, "1", RumVocabulary.VITAL_DEDUP_TTL);
            if (!Boolean.TRUE.equals(first)) {
                discard(first == null ? "dedupe_unavailable" : "duplicate_vital");
                return;
            }
        } catch (RuntimeException ignored) {
            discard("dedupe_unavailable");
            return;
        }

        if (name.equals("CLS")) {
            DistributionSummary.builder("shop.rum.cls")
                    .description("First finalized CLS sample per navigation (unitless)")
                    .tags("app", app, "viewport", viewport)
                    .serviceLevelObjectives(
                            0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.25, 0.5, 1, 5, 10, RumVocabulary.MAX_CLS)
                    .register(registry)
                    .record(value);
        } else {
            Timer.builder("shop.rum.vital")
                    .description("First finalized LCP/INP sample per navigation")
                    .tags("app", app, "viewport", viewport, "name", name)
                    .serviceLevelObjectives(
                            Duration.ofMillis(50),
                            Duration.ofMillis(100),
                            Duration.ofMillis(200),
                            Duration.ofMillis(300),
                            Duration.ofMillis(500),
                            Duration.ofSeconds(1),
                            Duration.ofMillis(1500),
                            Duration.ofMillis(2500),
                            Duration.ofSeconds(4),
                            Duration.ofSeconds(6),
                            Duration.ofSeconds(10),
                            Duration.ofSeconds(30),
                            Duration.ofMinutes(1),
                            Duration.ofMillis(RumVocabulary.MAX_VITAL_MILLIS))
                    .register(registry)
                    .record((long) (value * 1_000_000), TimeUnit.NANOSECONDS);
        }
    }

    private void discard(String reason) {
        registry.counter("shop.rum.vitals.discarded", "reason", reason).increment();
    }
}
