package com.shop.platform.infra.observability;

import java.util.concurrent.ThreadPoolExecutor;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;

/**
 * 定时任务配置：@Scheduled 默认单线程调度器，且不带 MDC（trace_id 断链）。
 * 这里换成显式 ThreadPoolTaskScheduler + MdcTaskDecorator——无上游上下文时装饰器自动生成新 trace_id，
 * 让超时关单等任务在日志里是完整链路。
 */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
public class SchedulingConfig implements SchedulingConfigurer {

    private final MdcTaskDecorator mdcTaskDecorator;

    public SchedulingConfig(MdcTaskDecorator mdcTaskDecorator) {
        this.mdcTaskDecorator = mdcTaskDecorator;
    }

    @Override
    public void configureTasks(ScheduledTaskRegistrar registrar) {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setThreadNamePrefix("sched-");
        scheduler.setPoolSize(2);
        scheduler.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        scheduler.setTaskDecorator(mdcTaskDecorator);
        scheduler.initialize();
        registrar.setTaskScheduler(scheduler);
    }
}
