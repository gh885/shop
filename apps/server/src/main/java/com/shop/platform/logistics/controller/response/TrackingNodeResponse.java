package com.shop.platform.logistics.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.logistics.model.ShipmentStatus;
import com.shop.platform.logistics.model.TrackingNodeCode;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;

/**
 * 轨迹节点出参：只吐归一化节点码与展示用描述，承运商原始状态码不外泄（SDK 契约只认标准词表）。
 *
 * <p>{@code status} 是 {@code nodeCode} 推导出的粗粒度状态（见 {@link TrackingNodeCode#status()}），
 * 一并吐给前端：买家侧轨迹要按状态分段展示（到达/离开分拨同属"运输中"），
 * 若由前端复制一份「节点码 → 状态」映射表，两张表迟早漂移。推导仍是后端唯一真相。
 */
public record TrackingNodeResponse(
        @Schema(requiredMode = REQUIRED) TrackingNodeCode nodeCode,
        @Schema(requiredMode = REQUIRED) ShipmentStatus status,
        @Schema(requiredMode = REQUIRED, nullable = true) String description,
        @Schema(requiredMode = REQUIRED, nullable = true) String location,
        @Schema(requiredMode = REQUIRED) OffsetDateTime occurredAt) {}
