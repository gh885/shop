package com.shop.telemetry.sdk.spring;

import javax.sql.DataSource;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 挂载点 3/5 的接线：把容器里**每一个** {@link DataSource} bean 包一层。
 *
 * <p>用 {@link BeanPostProcessor} 而不是再定义一个 {@code DataSource} bean：容器里那个
 * DataSource 是 Boot 造出来的，再定义一个会形成"谁先谁后"的优先级博弈（PostConstruct 顺序、
 * Hikari 的初始化时机都会被搅乱）。包装现有 bean 不参与装配顺序，也就不可能把连接池搞坏。
 *
 * <p>**没配 dsn 就不包**：没接平台时连代理对象都不建，SQL 路径上与不装这个 SDK 完全一致。
 * 这是"采集端不能成为线上变量"这条规则的实现。
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(TelemetrySdkProperties.class)
public class TelemetryJdbcConfiguration {

    @Bean
    static BeanPostProcessor telemetryDataSourcePostProcessor(TelemetrySdkProperties properties) {
        boolean enabled = properties.dsn() != null && !properties.dsn().isBlank();
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String beanName) throws BeansException {
                if (!enabled || !(bean instanceof DataSource dataSource) || bean instanceof TelemetryDataSource) {
                    return bean;
                }
                return new TelemetryDataSource(dataSource);
            }
        };
    }
}
