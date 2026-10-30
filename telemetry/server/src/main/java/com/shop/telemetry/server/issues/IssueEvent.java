package com.shop.telemetry.server.issues;

import java.time.Instant;

/**
 * 更新 issue 聚合所需的最小输入。
 *
 * <p>不含 payload：issue 表是聚合视图，把原文带进来会让"列表查询"顺手拖大对象。
 *
 * @param fingerprint 分组结果（{@code grouping} 的纯函数产物）
 * @param release 只用于记 first/last release，供回归检测（M3）
 */
public record IssueEvent(
        String projectId,
        String fingerprint,
        String title,
        String culprit,
        String level,
        String release,
        String tenantId,
        Instant occurredAt) {

    public IssueEvent withFingerprint(String fingerprint) {
        return new IssueEvent(
                projectId, fingerprint, title, culprit, level, release, tenantId, occurredAt);
    }
}
