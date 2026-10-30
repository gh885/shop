package com.shop.telemetry.sdk.spring;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mock.env.MockEnvironment;

/**
 * 接线测试：容器里的 DataSource 到底有没有被包一层。
 *
 * <p>为什么值得单独测：{@code BeanPostProcessor} 的注册时机是 Spring 里最容易"写了但没生效"的地方
 * ——不会有报错，只是 span 永远不出现在树上。这类问题在真机上排查成本极高。
 */
class TelemetryJdbcConfigurationTest {

    @Test
    void wrapsDataSourceBeanWhenDsnConfigured() {
        try (AnnotationConfigApplicationContext context = context("http://dev-key@localhost:8090/1")) {
            DataSource dataSource = context.getBean(DataSource.class);

            assertInstanceOf(TelemetryDataSource.class, dataSource, "配了 dsn 就必须包一层，否则 SQL 永远不出 span");
        }
    }

    /** 没接平台时不包：SQL 路径上与"没装这个 SDK"完全一致。 */
    @Test
    void leavesDataSourceAloneWithoutDsn() {
        try (AnnotationConfigApplicationContext context = context("")) {
            DataSource dataSource = context.getBean(DataSource.class);

            assertInstanceOf(StubDataSource.class, dataSource, "没配 dsn 时连代理都不该建");
        }
    }

    private static AnnotationConfigApplicationContext context(String dsn) {
        AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext();
        MockEnvironment environment = new MockEnvironment()
                .withProperty("telemetry.sdk.public-key", "dev-key")
                .withProperty("telemetry.sdk.service-name", "api")
                .withProperty("telemetry.sdk.dsn", dsn);
        context.setEnvironment(environment);
        context.register(TelemetryJdbcConfiguration.class, DataSourceFixture.class);
        context.refresh();
        return context;
    }

    @Configuration(proxyBeanMethods = false)
    static class DataSourceFixture {

        @Bean
        DataSource dataSource() {
            return new StubDataSource();
        }
    }
}
