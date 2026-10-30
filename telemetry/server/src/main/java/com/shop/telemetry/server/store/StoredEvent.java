package com.shop.telemetry.server.store;

import java.time.Instant;

/**
 * 已落库的事件：写入形状 + 服务端侧的字段。
 *
 * <p>组合而不是复制 {@link EventRecord} 的十几个字段——两个形状一起演进时，
 * 复制版本会漂移，而组合版本编译不过。
 *
 * @param receivedAt 落库时间。列表与分页按它排序（occurred_at 由客户端决定，可被伪造或乱序）
 * @param issueId 关联的 issue；M0 在插入后回填，读路径上可能为 null
 */
public record StoredEvent(long id, Instant receivedAt, Long issueId, EventRecord event) {}
