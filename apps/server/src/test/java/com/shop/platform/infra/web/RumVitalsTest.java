package com.shop.platform.infra.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.Timer;
import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import tools.jackson.databind.ObjectMapper;

class RumVitalsTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);

    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> values = mock(ValueOperations.class);

    private final PrometheusMeterRegistry registry = new PrometheusMeterRegistry(PrometheusConfig.DEFAULT);
    private final RumVitals vitals = new RumVitals(redis, registry);

    @BeforeEach
    void 去重键默认首次出现() {
        when(redis.opsForValue()).thenReturn(values);
        when(values.setIfAbsent(anyString(), eq("1"), eq(RumVocabulary.VITAL_DEDUP_TTL)))
                .thenReturn(true);
    }

    @AfterEach
    void 释放注册表() {
        registry.close();
    }

    private void accept(String name, String value, String id) {
        vitals.accept(
                mapper.readTree(
                        """
                {"name":"%s","value":%s,"metricId":"%s","viewport":"small",
                 "route":"/products/private-id","userId":"private-user","version":"unique-build"}
                """
                                .formatted(name, value, id)),
                "web");
    }

    @Test
    void 毫秒转秒保留精度_导出可跨实例聚合的桶而非本地分位() {
        accept("LCP", "1250.5", "v6-one");
        accept("LCP", "3000", "v6-two");
        Timer timer = registry.get("shop.rum.vital").tag("name", "LCP").timer();
        assertThat(timer.count()).isEqualTo(2);
        assertThat(timer.totalTime(TimeUnit.MILLISECONDS)).isEqualTo(4250.5);
        String scrape = registry.scrape();
        assertThat(scrape).contains("shop_rum_vital_seconds_bucket", "le=\"2.5\"", "shop_rum_vital_seconds_count");
        assertThat(scrape).doesNotContain("private-id", "private-user", "unique-build", "v6-one", "quantile=");
    }

    @Test
    void 零CLS是有效样本_无量纲且不混入时间桶() {
        accept("CLS", "0", "v6-zero");
        accept("CLS", "0.1", "v6-shift");
        var summary = registry.get("shop.rum.cls").summary();
        assertThat(summary.count()).isEqualTo(2);
        assertThat(summary.totalAmount()).isEqualTo(0.1);
        assertThat(registry.scrape()).contains("shop_rum_cls_bucket", "le=\"0.1\"");
        assertThat(registry.find("shop.rum.vital").timer()).isNull();
    }

    @Test
    void 同一指标重放_只接受第一份样本() {
        when(values.setIfAbsent(anyString(), eq("1"), any(Duration.class))).thenReturn(true, false);
        accept("INP", "180", "v6-duplicate");
        accept("INP", "500", "v6-duplicate");
        assertThat(registry.get("shop.rum.vital").timer().count()).isEqualTo(1);
        assertThat(registry.get("shop.rum.vitals.discarded")
                        .tag("reason", "duplicate_vital")
                        .counter()
                        .count())
                .isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"-1", "300001", "1e100", "null", "\"200\"", "true", "[]", "{}"})
    void 非法耗时拒收且不创建去重键(String value) {
        accept("LCP", value, "v6-invalid");
        assertThat(registry.find("shop.rum.vital").timer()).isNull();
        assertThat(registry.get("shop.rum.vitals.discarded")
                        .tag("reason", "invalid_vital")
                        .counter()
                        .count())
                .isEqualTo(1);
        verifyNoInteractions(values);
    }

    @Test
    void 超范围CLS与未知指标不生成时序() {
        accept("CLS", "101", "v6-big");
        accept("user-controlled-name", "1", "v6-name");
        assertThat(registry.getMeters()).hasSize(1);
        verifyNoInteractions(values);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "{\"name\":\"LCP\",\"value\":1,\"metricId\":123,\"viewport\":\"small\"}",
                "{\"name\":\"LCP\",\"value\":1,\"metricId\":\"bad:id\",\"viewport\":\"small\"}",
                "{\"name\":\"LCP\",\"value\":1,\"metricId\":\"v6-id\",\"viewport\":\"arbitrary-label\"}"
            })
    void 非法标签和去重ID拒收(String body) {
        vitals.accept(mapper.readTree(body), "web");
        assertThat(registry.getMeters()).hasSize(1);
        verifyNoInteractions(values);
    }

    @Test
    void Redis失败不落桶_显式记录丢弃原因() {
        when(values.setIfAbsent(anyString(), eq("1"), any(Duration.class)))
                .thenThrow(new IllegalStateException("offline"));
        accept("LCP", "1000", "v6-unavailable");
        assertThat(registry.find("shop.rum.vital").timer()).isNull();
        assertThat(registry.get("shop.rum.vitals.discarded")
                        .tag("reason", "dedupe_unavailable")
                        .counter()
                        .count())
                .isEqualTo(1);
    }
}
