package com.shop.telemetry.sdk.spring;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * shop 侧唯一的接线点：一个 {@code @Import} 就够，不需要 auto-configuration SPI 文件。
 *
 * <p>刻意不做 {@code spring.factories / AutoConfiguration.imports}：这套东西只服务本仓库，
 * 自动装配带来的隐式依赖（谁在何时注册了 Filter）在排查采集问题时是净负担。
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(TelemetrySdkProperties.class)
// 一个 @Import 就带上全部挂载点；只想接其中之一时单独 import 对应的配置类即可
@org.springframework.context.annotation.Import({
    TelemetryJdbcConfiguration.class,
    TelemetryAsyncConfiguration.class,
})
public class TelemetryWebConfiguration {

    /**
     * 标签来源。默认空实现；shop 的 infra 模块提供一个读 tenant / 用户的实现即可，
     * 这样采集端不需要知道 shop 的领域模型。
     */
    @Bean
    @ConditionalOnMissingBean
    public TelemetryTagContributor telemetryTagContributor() {
        return request -> java.util.Map.of();
    }

    /**
     * 出口：配了 dsn 才真发，否则只打日志。
     *
     * <p>"不配就不发"是刻意的默认：本地开发、CI、以及没接平台的环境不应该因为采集把请求拖慢，
     * 也不该往某个人的机器上灌数据。
     */
    @Bean
    @ConditionalOnMissingBean
    public TelemetryErrorReporter telemetryErrorReporter(
            TelemetrySdkProperties properties, TelemetryTagContributor tags) {
        if (properties.dsn() == null || properties.dsn().isBlank()) {
            return new LoggingTelemetryErrorReporter();
        }
        return SentryTelemetryErrorReporter.init(properties, tags);
    }

    @Bean
    @ConditionalOnMissingBean
    public TelemetryWebFilter telemetryWebFilter(
            TelemetryErrorReporter reporter, TelemetrySdkProperties properties) {
        return new TelemetryWebFilter(reporter, properties.publicKey(), properties.tracesSampleRate());
    }
}
