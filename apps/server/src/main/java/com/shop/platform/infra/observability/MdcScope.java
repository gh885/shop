package com.shop.platform.infra.observability;

import java.util.ArrayList;
import java.util.List;
import org.slf4j.MDC;

/**
 * 一段带结构化字段的日志作用域：进入时写 MDC，离开时精确回滚。
 *
 * <pre>{@code
 * try (var scope = MdcScope.of("trace_id", id, "env", env)) {
 *     log.info("...");
 * }
 * }</pre>
 *
 * <p>替代手写的 put/try/finally/remove 四段式：那种写法要求 put 与 remove 两张清单永远对称，
 * 而字段一旦带条件分支（「有 userId 才写」）对称性就得靠人肉维护——漏一个 remove 就是跨请求的
 * MDC 污染，表现为另一个请求的日志上莫名挂着别人的 user_id，几乎无法排查。
 *
 * <p>回滚而非清空：嵌套作用域下恢复外层原值（RequestIdFilter 的 trace_id 等不受影响）。
 *
 * <p><b>业务事件不要用它</b>，走 {@link BizEvent}：这个形状把「埋字段」和「打那行日志」交给调用方分两步做，
 * 忘了第二步就是一个静默丢失的事件；而且 {@code BusinessEventCatalogTest} 挡着绕过出口手写 {@code event}。
 * 本类留下的是信封与上下文字段的写法（RequestIdFilter 的 trace_id/version/env）。
 */
public final class MdcScope implements AutoCloseable {

    private final List<String> keys = new ArrayList<>();
    private final List<String> previous = new ArrayList<>();

    private MdcScope() {}

    /** 键值成对传入；值为 null 的键跳过（免去调用方写 if 分支） */
    public static MdcScope of(String... keyValuePairs) {
        if (keyValuePairs.length % 2 != 0) {
            throw new IllegalArgumentException("MdcScope 需要成对的 key/value，收到 " + keyValuePairs.length + " 个参数");
        }
        MdcScope scope = new MdcScope();
        for (int i = 0; i < keyValuePairs.length; i += 2) {
            scope.put(keyValuePairs[i], keyValuePairs[i + 1]);
        }
        return scope;
    }

    /** 追加一个字段（条件字段的链式写法：{@code scope.put("user_id", id)}） */
    public MdcScope put(String key, String value) {
        if (value == null) {
            return this;
        }
        keys.add(key);
        previous.add(MDC.get(key));
        MDC.put(key, value);
        return this;
    }

    @Override
    public void close() {
        // 逆序回滚：同 key 被重复 put 时也能层层还原
        for (int i = keys.size() - 1; i >= 0; i--) {
            String prior = previous.get(i);
            if (prior == null) {
                MDC.remove(keys.get(i));
            } else {
                MDC.put(keys.get(i), prior);
            }
        }
    }
}
