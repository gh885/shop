package com.shop.platform.logistics.dto;

import com.shop.platform.common.NoteFieldRules;
import com.shop.platform.common.TrackingFieldRules;
import com.shop.platform.logistics.model.TrackingNodeCode;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;

/**
 * 录入轨迹节点入参（平台运营补录；真实承运商推送落同一个 service 落点）。
 *
 * <p>{@code nodeCode} 声明为归一化枚举：非法值由消息转换器挡在 400，承运商原始码不进领域层。
 * {@code occurredAt} 是承运商事件发生时刻——排序与状态推进都以它为准，不取落库时间（补录与迟到推送都要对）。
 */
public record TrackingNodeRequest(
        @NotNull TrackingNodeCode nodeCode,
        @NotNull OffsetDateTime occurredAt,
        @Size(max = NoteFieldRules.FREE_TEXT_MAX) String description,
        @Size(max = TrackingFieldRules.LOCATION_MAX) String location) {}
