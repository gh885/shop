package com.shop.telemetry.server.ingest.internal;

import com.shop.telemetry.server.ingest.NormalizedEvent;

/**
 * 归一化只有两种结局：可落库，或带原因丢弃。没有异常路径——解析失败是常态
 * （客户端版本差异、字段改名），用异常表达会让"每条都要 catch"污染调用方。
 */
sealed interface NormalizeResult {

    record Ok(NormalizedEvent event) implements NormalizeResult {}

    record Drop(String reason) implements NormalizeResult {}
}
