package com.shop.telemetry.sdk.spring;

import io.sentry.ISpan;
import org.springframework.core.task.TaskDecorator;

/**
 * 挂载点 4/5：把当前 span 带过线程边界。
 *
 * <p>为什么必须单独做这件事：{@code TelemetryTrace} 把当前 span 存在 **ThreadLocal** 里，
 * 而 {@code @Async}、{@code ThreadPoolTaskExecutor}、{@code CompletableFuture.supplyAsync} 都会
 * 换线程。换过去之后 ThreadLocal 是空的，于是在异步任务里发出的 SQL 变成一个**孤儿 span**——
 * 树上凭空多出一截没有父亲的节点，比"少一个 span"更难查（它会让人以为是链路实现坏了）。
 *
 * <p>实现只做"传进去、跑完还原"两件事，**不建新 span**：异步跳转本身没有耗时可言，
 * 给它造一个 span 只会在树上加噪声。任务里如果自己开 span（比如一次 SQL），它会正确挂在
 * **提交那一刻**的父节点下——即使那个父节点在任务开始时已经 finish，服务端按 span_id 拼树，
 * 顺序不影响结果。
 */
public final class TelemetryTaskDecorator implements TaskDecorator {

    @Override
    public Runnable decorate(Runnable runnable) {
        ISpan parent = TelemetryTrace.current(); // 提交线程的 span
        if (parent == null) {
            return runnable; // 没在 trace 里：连一层 wrapper 都不加
        }
        return () -> {
            ISpan previous = TelemetryTrace.current(); // 线程池复用时可能有残留，先存着
            TelemetryTrace.attach(parent);
            try {
                runnable.run();
            } finally {
                TelemetryTrace.attach(previous);
            }
        };
    }
}
