package com.shop.platform.audit.dto;

import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 审计查询入参（GET /admin/audits 的 query）。全部可选：不给条件就是「最近发生了什么」。
 *
 * <p>{@code operatorId} 收 UUID 而不是工号文本：审计查询的调用方是管理端，它手里本来就只有 id
 * （工号 → 人是展示名那一列的事，不做模糊匹配 —— 追责查询宁可多筛两次也不要一个漏网的模糊条件）。
 */
public record AdminAuditQuery(
        UUID operatorId,
        @Size(max = AuditFieldRules.TARGET_TYPE_MAX) String targetType,
        @Size(max = AuditFieldRules.TARGET_ID_MAX) String targetId,
        @Size(max = AuditFieldRules.ACTION_MAX) String action,
        OffsetDateTime from,
        OffsetDateTime to) {}
