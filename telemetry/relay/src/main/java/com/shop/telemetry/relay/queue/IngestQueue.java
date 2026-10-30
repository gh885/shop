package com.shop.telemetry.relay.queue;

/**
 * relay 与 server 之间唯一的通道。
 *
 * <p>特意不用「共用一张 outbox 表」：那会让 relay 依赖 server 的数据库 schema，
 * 搬家或换存储时两边一起动。Redis Stream 这个接口是中立地面——语义上最接近 Kafka
 * （消费组 / pending 重投 / 可回放），但不需要 broker。
 *
 * <p>将来换 Kafka，只换实现。
 */
public interface IngestQueue {

    /**
     * @param projectId 已在 relay 鉴权过，worker 不再信任 payload 里的 project 字段
     * @param kind item 类型（event / transaction / session / check_in / release）
     * @param payload item 原始内容，**未校验**
     */
    void push(String projectId, String kind, String payload);
}
