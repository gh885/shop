package com.shop.platform.common.security;

import java.util.Optional;

/**
 * 当前操作人的线程内上下文。由认证过滤器在请求入口写入，在 {@code finally} 里清掉。
 *
 * <p><b>ThreadLocal 会被异步打断。</b> {@code @Async}、线程池、{@code CompletableFuture} 里都拿不到操作人，
 * 表现为"权限忽然全没了"。定时任务和消息消费必须显式调用 {@link #runAs}，不要指望继承。
 *
 * <p>没有隐式的兜底身份——拿不到操作人就是未认证，抛 {@link ForbiddenException}。给个匿名兜底是权限系统最
 * 常见的自毁方式。
 */
public final class OperatorContext {

    private static final ThreadLocal<CurrentOperator> HOLDER = new ThreadLocal<>();

    private OperatorContext() {}

    public static void set(CurrentOperator operator) {
        HOLDER.set(operator);
    }

    public static void clear() {
        HOLDER.remove();
    }

    public static Optional<CurrentOperator> current() {
        return Optional.ofNullable(HOLDER.get());
    }

    public static CurrentOperator require() {
        CurrentOperator operator = HOLDER.get();
        if (operator == null) {
            throw ForbiddenException.noOperator();
        }
        return operator;
    }

    /** 给定时任务、消息消费、测试用：临时套一个身份，退出时一定还原。 */
    public static void runAs(CurrentOperator operator, Runnable action) {
        CurrentOperator previous = HOLDER.get();
        set(operator);
        try {
            action.run();
        } finally {
            if (previous == null) {
                clear();
            } else {
                set(previous);
            }
        }
    }
}
