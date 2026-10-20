package com.shop.platform.infra.db;

import javax.sql.DataSource;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 把 Spring Boot 自动装配的 {@link DataSource} 包一层 {@link TenantAwareDataSource}。
 *
 * <p>用 {@link BeanPostProcessor} 而不是自己 new 一个 HikariDataSource：数据源的连接池参数、
 * 环境变量覆盖、测试库切换全在 Boot 的自动装配里，重造一份等于把那套配置抄第二遍（抄漏一项就是
 * 「本地能跑、CI 连错库」）。
 *
 * <p>包装只做一件事：借出连接时写入 {@code app.current_shop}，归还前清空。它不改变连接池行为。
 */
@Configuration(proxyBeanMethods = false)
public class TenantDataSourceConfig {

    @Bean
    static BeanPostProcessor tenantDataSourceWrapper() {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String beanName) {
                if (bean instanceof DataSource dataSource && !(bean instanceof TenantAwareDataSource)) {
                    return new TenantAwareDataSource(dataSource);
                }
                return bean;
            }
        };
    }
}
