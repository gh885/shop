package com.shop.platform.logistics.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.logistics.model.TrackingNodeCode;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;

/** 轨迹节点出参：只吐归一化节点码与展示用描述，承运商原始状态码不外泄（SDK 契约只认标准词表）。 */
public record TrackingNodeResponse(
        @Schema(requiredMode = REQUIRED) TrackingNodeCode nodeCode,
        @Schema(requiredMode = REQUIRED, nullable = true) String description,
        @Schema(requiredMode = REQUIRED, nullable = true) String location,
        @Schema(requiredMode = REQUIRED) OffsetDateTime occurredAt) {}
