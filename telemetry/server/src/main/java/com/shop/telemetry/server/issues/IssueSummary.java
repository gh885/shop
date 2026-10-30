package com.shop.telemetry.server.issues;

import java.time.Instant;

/**
 * issue 的读模型：列表与详情共用一个形状。
 *
 * <p>刻意不含 payload：列表要能一次取几百条，任何"顺手带点上下文"的设计都会在这里变成事故。
 * 详情页需要事件原文时走 {@code /events?issueId=}，那是另一条路径。
 */
public record IssueSummary(
        long id,
        String title,
        String culprit,
        String level,
        String status,
        Instant firstSeen,
        Instant lastSeen,
        long eventCount,
        String releaseFirst,
        String releaseLast,
        String tenantId) {}
