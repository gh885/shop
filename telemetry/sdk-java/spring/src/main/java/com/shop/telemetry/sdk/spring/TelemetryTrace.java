package com.shop.telemetry.sdk.spring;

import io.sentry.ISpan;
import io.sentry.SpanStatus;
import java.util.function.Supplier;

/**
 * 采集端给业务代码（以及 JDBC/HTTP 客户端挂载点）的 span 入口。
 *
 * <p>**没有活动事务时是直通**：没采样、没配 dsn、或者这次请求根本不在 trace 里，`inSpan` 只是
 * 调用一下 {@code body}。所以调用方不需要写 {@code if (tracingEnabled)} ——这类判断一旦散落到业务
 * 代码里，第一个漏掉的人就会让 span 树上多出一段孤儿。
 *
 * <p>当前 span 存在 **ThreadLocal**：这是刻意的限制，也是 {@code spring/async} 挂载点存在的理由。
 * {@code @Async} / 线程池会让子线程看不到父 span，需要显式传递（M2：{@code TaskDecorator}）。
 *
 * <p>不绑 SDK 的 scope 而自己管 ThreadLocal：scope 是进程级可变状态，绑/解绑顺序错一次就会把
 * 别的请求的 span 串进来；这里的作用域边界由 filter 的 finally 决定，不可能漏。
 */
public final class TelemetryTrace {

    private static final ThreadLocal<ISpan> CURRENT = new ThreadLocal<>();

    private TelemetryTrace() {}

    /** filter 进入时调用。{@code null} = 这次请求没采到，所有 {@code inSpan} 直通。 */
    static void attach(ISpan span) {
        CURRENT.set(span);
    }

    static void detach() {
        CURRENT.remove();
    }

    /** 提交线程用它把 span 交给 {@link TelemetryTaskDecorator}；没有事务时返回 null。 */
    static ISpan current() {
        return CURRENT.get();
    }

    /**
     * 包一段可测耗时的动作。
     *
     * <p>状态语义：正常完成 → {@code OK}；抛异常 → 记 throwable 并置 {@code INTERNAL_ERROR}
     * （Sentry 里"哪个 span 出错"就是这么表达的，错误事件自己有 level，两者不冲突）。
     */
    public static <T> T inSpan(String op, String description, Supplier<T> body) {
        ISpan parent = CURRENT.get();
        if (parent == null) {
            return body.get();
        }
        ISpan span = parent.startChild(op, description);
        if (span == null) {
            return body.get();
        }
        CURRENT.set(span);
        try {
            T result = body.get();
            span.setStatus(SpanStatus.OK);
            return result;
        } catch (RuntimeException e) {
            span.setThrowable(e);
            span.setStatus(SpanStatus.INTERNAL_ERROR);
            throw e;
        } finally {
            span.finish();
            CURRENT.set(parent);
        }
    }

    public static void inSpan(String op, String description, Runnable body) {
        inSpan(op, description, () -> {
            body.run();
            return null;
        });
    }
}
