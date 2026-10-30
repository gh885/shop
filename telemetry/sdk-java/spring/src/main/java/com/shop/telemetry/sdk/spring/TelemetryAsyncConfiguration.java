package com.shop.telemetry.sdk.spring;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskDecorator;

/**
 * 挂载点 4/5 的接线：注册一个 {@link TaskDecorator} bean。
 *
 * <p>为什么是"注册 bean"而不是"给线程池设置装饰器"：Spring Boot 的
 * {@code ThreadPoolTaskExecutorBuilder} 会主动取容器里的 {@code TaskDecorator} bean 并应用到
 * {@code applicationTaskExecutor}（{@code @Async} 用的就是它）。这是唯一不需要反射、不需要
 * {@link org.springframework.beans.factory.config.BeanPostProcessor}、也不猜别人线程池怎么造的接法。
 *
 * <p>代价说清楚：**只管 Boot 那个默认执行器**。自定义 {@code ExecutorService} 需要自己
 * {@code setTaskDecorator(new TelemetryTaskDecorator())}——我们没有权利去改别人造的执行器，
 * 那也是 {@code spring/async} 这个挂载点唯一诚实的边界。
 *
 * <p>如果你自己定义了 {@code TaskDecorator} bean，本 bean 会让位（{@code @ConditionalOnMissingBean}）。
 * 那就需要在你的装饰器里调用 {@code new TelemetryTaskDecorator().decorate(...)} 组合一下，
 * 否则异步任务里的 span 会掉链——这是"让位"必须付出的代价，写在 README 里。
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(TelemetrySdkProperties.class)
public class TelemetryAsyncConfiguration {

    @Bean
    @ConditionalOnMissingBean(TaskDecorator.class)
    public TaskDecorator telemetryTaskDecorator() {
        // 没配 dsn 时也不用条件装配：没有事务时 decorate() 原样返回，开销是一次 ThreadLocal 读
        return new TelemetryTaskDecorator();
    }
}
