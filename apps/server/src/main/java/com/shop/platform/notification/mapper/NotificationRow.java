package com.shop.platform.notification.mapper;

import java.time.Instant;
import java.util.UUID;

/**
 * {@code notification.message} 的读投影。params 以 JSON 原文带出，服务层再解成 Map——
 * 投影 record 保持纯数据，Jackson 依赖不进 mapper 包。
 */
public record NotificationRow(
        UUID id,
        String recipientType,
        UUID buyerId,
        UUID merchantId,
        String type,
        String paramsJson,
        String link,
        Instant readAt,
        Instant createdAt) {}
