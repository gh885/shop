package com.shop.telemetry.proto;

import java.util.List;

/**
 * 一个完整的 envelope：一行 header（含 dsn / event_id / sentry_key）+ N 个 item。
 *
 * @param headerJson 第一行，未解析。归属（project）与去重键都在这里。
 * @param items 至少一项；Sentry 协议不允许空 envelope。
 */
public record Envelope(String headerJson, List<EnvelopeItem> items) {}
