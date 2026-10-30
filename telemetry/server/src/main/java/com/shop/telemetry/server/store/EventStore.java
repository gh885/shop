package com.shop.telemetry.server.store;

import java.util.List;
import java.util.Optional;

/**
 * 三种访问模式，三种实现，一个接口。
 *
 * <p>Sentry 把这三件事分别交给 nodestore（blob）、ClickHouse/snuba（列存）、Postgres（issue）。
 * 我们量级小，先用一个 PG 表全包，但**方法按模式拆开**，否则将来换存储时调用方会跟着一起改。
 */
public interface EventStore {

    /**
     * 追加一条。重复投递返回 {@code false}（0 行更新是判决，不是异常）——
     * 这个布尔值是 at-least-once 语义下"该不该计数"的唯一依据。
     */
    boolean append(EventRecord event);

    /** 点查：按 id 取完整原文 + 提升列，给详情页。 */
    Optional<StoredEvent> get(String projectId, String eventId);

    /**
     * trace 视图：按 trace_id 取整条链上的所有事件（跨端）。
     *
     * <p>时间窗不是可选项：trace_id 是客户端生成的，恶意客户端可以让同一个 id 永远命中历史行，
     * 加窗是唯一不依赖客户端诚实的保护。
     */
    List<StoredEvent> byTrace(String projectId, String traceId, java.time.Instant from, int limit);

    /** 扫：按项目 + 时间窗 + 可选 issue 过滤。必须带 limit。 */
    List<StoredEvent> search(EventQuery query);

    /** 分组算完后回填关联。与 append 同属一个事务，由调用方保证。 */
    void linkIssue(String projectId, String eventId, long issueId);
}
