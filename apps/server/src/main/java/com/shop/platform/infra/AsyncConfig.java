package com.shop.platform.infra;

import java.util.concurrent.Executor;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * 异步任务配置（REQ-06）：@Async 使用 MdcTaskDecorator 传递 MDC 上下文。 若后续使用 @Scheduled，另配 SchedulingConfigurer +
 * ThreadPoolTaskScheduler 并 setTaskDecorator。
 */
@Configuration
@EnableAsync
public class AsyncConfig implements AsyncConfigurer {

    private final MdcTaskDecorator mdcTaskDecorator;

    public AsyncConfig(MdcTaskDecorator mdcTaskDecorator) {
        this.mdcTaskDecorator = mdcTaskDecorator;
    }

    @Override
    public Executor getAsyncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setTaskDecorator(mdcTaskDecorator);
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("async-");
        executor.initialize();
        return executor;
    }
}
