package com.shop.telemetry.server.store;

import java.time.Instant;

/**
 * 一条事件的**写入**形状。
 *
 * <p>提升列（level/release/transaction/trace_id/tenant_id…）全部来自 relay 鉴权 + 归一化，
 * 它们的唯一用途是"不解析 jsonb 也能筛"。payload 原样保留，含我们不理解的字段。
 *
 * @param projectId 归属，来自 relay 鉴权结果，**不信任 payload 里的同名字段**
 * @param eventId 32 位十六进制；客户端没给时服务端生成
 * @param occurredAt 事件发生时间（客户端给的 timestamp）
 * @param fingerprint 分组结果；唯一索引的一部分，落库前必须算好
 */
public record EventRecord(
        String projectId,
        String eventId,
        Instant occurredAt,
        String kind,
        String level,
        String platform,
        String release,
        String environment,
        String transaction,
        String tenantId,
        String traceId,
        String spanId,
        String fingerprint,
        String payload) {

    /** 分组算完之后回填。record 不可变，用复制代替 setter——避免"半个对象"在事务里流动。 */
    public EventRecord withFingerprint(String fingerprint) {
        return new EventRecord(
                projectId, eventId, occurredAt, kind, level, platform, release, environment,
                transaction, tenantId, traceId, spanId, fingerprint, payload);
    }
}
