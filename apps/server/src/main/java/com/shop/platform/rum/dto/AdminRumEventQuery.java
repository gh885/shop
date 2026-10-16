package com.shop.platform.rum.dto;

import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;

/**
 * 遥测明细列表入参（GET /admin/rum/events 的 query）。时间窗口径同 {@link AdminRumIssueQuery}。
 *
 * <p>{@code fingerprint} 是「从问题列表点进来」那一步：它在问题列表里是分组键，到这里是等值筛选——
 * 同一个值，两个用途，不另起一个名字。
 */
public record AdminRumEventQuery(
        @Size(max = RumFieldRules.FINGERPRINT_MAX) String fingerprint,
        @Size(max = RumFieldRules.APP_MAX) String app,
        @Size(max = RumFieldRules.KIND_MAX) String kind,
        @Size(max = RumFieldRules.ROUTE_MAX) String route,
        OffsetDateTime from,
        OffsetDateTime to) {}
