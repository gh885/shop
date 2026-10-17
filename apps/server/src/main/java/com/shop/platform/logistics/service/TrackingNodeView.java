package com.shop.platform.logistics.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.logistics.model.TrackingNodeCode;
import com.shop.platform.logistics.model.TrackingStage;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;

/**
 * 轨迹节点出参：只吐归一化节点码与展示用描述，承运商原始状态码不外泄（SDK 契约只认标准词表）。
 *
 * <p>{@code stage} 是 {@code nodeCode} 推导出的展示阶段（见 {@link TrackingNodeCode#stage()}），
 * 一并吐给前端：买家侧轨迹要按阶段分段展示（到达/离开分拨同属「运输中」），
 * 若由前端复制一份「节点码 → 阶段」映射表，两张表迟早漂移。推导仍是后端唯一真相。
 *
 * <p>阶段和包裹履约状态是两条轴：包裹只有待发货/已发出/已签收/已取消，节点可以更细。
 */
@Schema(name = "TrackingNodeResponse")
public record TrackingNodeView(
        @Schema(requiredMode = REQUIRED) TrackingNodeCode nodeCode,
        @Schema(requiredMode = REQUIRED) TrackingStage stage,
        @Schema(requiredMode = REQUIRED, nullable = true) String description,
        @Schema(requiredMode = REQUIRED, nullable = true) String location,
        @Schema(requiredMode = REQUIRED) OffsetDateTime occurredAt) {}
