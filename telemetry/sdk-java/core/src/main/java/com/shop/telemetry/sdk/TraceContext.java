package com.shop.telemetry.sdk;

/**
 * 一次请求的链路上下文。
 *
 * <p>{@code spanId} 与 {@code parentSpanId} 必须分开：入站头里带的是**上一跳**的 span，
 * 我们自己这一段是新 span。把两者混成一个字段（很多轻量实现会这么干）会让下游收到的
 * 父节点指向错误的层，链路图就永远是平的。
 *
 * @param traceId 32 位十六进制，整条链路唯一
 * @param spanId 本进程这一段的 16 位十六进制，新生成
 * @param parentSpanId 入站头里的 span；没有入站头时为 null（本段是根）
 * @param sampled 采样决策。入站已决策时**必须继承**，否则前后端的 trace 会断头
 * @param publicKey DSN 里的公开 key，用于出站上报
 * @param release 版本；web 与 server 分别发版，一条链路里可能两个 release
 * @param environment 环境名
 */
public record TraceContext(
        String traceId,
        String spanId,
        String parentSpanId,
        boolean sampled,
        String publicKey,
        String release,
        String environment) {}
