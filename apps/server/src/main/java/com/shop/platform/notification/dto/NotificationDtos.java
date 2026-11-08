package com.shop.platform.notification.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 通知对外的形状。文案不在这里——type + params 交给前端 i18n 模板渲染。 */
public final class NotificationDtos {

    private NotificationDtos() {}

    public record NotificationView(
            UUID id,
            @Schema(description = "消息种类，前端按它选模板", example = "shipment_recorded") String type,
            @Schema(description = "模板插值参数，形状随 type 变化") Map<String, Object> params,
            @Schema(nullable = true, description = "买家端深链路径；商家侧暂无界面为 null") String link,
            @Schema(nullable = true) Instant readAt,
            Instant createdAt) {}

    public record NotificationPage(
            List<NotificationView> items,
            @Schema(nullable = true, description = "下一页游标；null = 没有更多") String nextCursor) {}
}
