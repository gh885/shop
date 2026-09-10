package com.shop.platform.logistics.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.logistics.model.ShipmentStatus;
import com.shop.platform.logistics.service.ShipmentTracking;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 物流轨迹出参（买家/卖家共用）：包裹摘要 + 事件时刻正序的节点列表。
 *
 * <p>不含内部治理字段（userId / shopId / 去重键），也不含包裹主键——对外只需要"哪个订单的物流"。
 * 展示文案（状态中文名、节点图标）留给前端投影，后端只给标准词表。
 */
public record ShipmentTrackingResponse(
        @Schema(requiredMode = REQUIRED) UUID orderId,
        @Schema(requiredMode = REQUIRED) String carrierName,
        @Schema(requiredMode = REQUIRED) String trackingNo,
        @Schema(requiredMode = REQUIRED) ShipmentStatus status,
        @Schema(requiredMode = REQUIRED) OffsetDateTime shippedAt,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime deliveredAt,
        @Schema(requiredMode = REQUIRED) List<TrackingNodeResponse> nodes) {

    public static ShipmentTrackingResponse from(ShipmentTracking tracking) {
        return new ShipmentTrackingResponse(
                tracking.shipment().getOrderId(),
                tracking.shipment().getCarrierName(),
                tracking.shipment().getTrackingNo(),
                tracking.shipment().getStatus(),
                tracking.shipment().getShippedAt(),
                tracking.shipment().getDeliveredAt(),
                tracking.nodes().stream()
                        .map(n -> new TrackingNodeResponse(
                                n.getNodeCode(), n.getDescription(), n.getLocation(), n.getOccurredAt()))
                        .toList());
    }
}
