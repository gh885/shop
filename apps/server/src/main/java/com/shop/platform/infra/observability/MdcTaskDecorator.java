package com.shop.platform.infra.observability;

import java.util.Map;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.task.TaskDecorator;
import org.springframework.stereotype.Component;

/**
 * 跨线程传递 MDC 上下文（REQ-06）。
 *
 * <ul>
 *   <li>@Async：从提交线程拷贝 trace_id/version/env 到执行线程
 *   <li>@Scheduled：无父上下文时自动生成新的 trace_id 作为链路起点
 * </ul>
 */
@Component
public class MdcTaskDecorator implements TaskDecorator {

    private final String version;

    private final String env;

    public MdcTaskDecorator(
            @Value("${spring.application.version:unknown}") String version,
            @Value("${spring.application.env:dev}") String env) {
        this.version = version;
        this.env = env;
    }

    @Override
    public Runnable decorate(Runnable task) {
        Map<String, String> parentContext = MDC.getCopyOfContextMap();
        return () -> {
            if (parentContext != null && !parentContext.isEmpty()) {
                MDC.setContextMap(parentContext);
            } else {
                // 无上游上下文（@Scheduled 等入口），自生成链路起点
                String requestId = UUID.randomUUID().toString().replace("-", "");
                MDC.put("trace_id", requestId);
                MDC.put("requestId", requestId);
            }
            // 定时任务没有 RequestIdFilter 补信封；若父上下文也未带，按同一份应用配置补齐。
            if (MDC.get("version") == null) {
                MDC.put("version", version);
            }
            if (MDC.get("env") == null) {
                MDC.put("env", env);
            }
            try {
                task.run();
            } finally {
                MDC.clear();
            }
        };
    }
}
