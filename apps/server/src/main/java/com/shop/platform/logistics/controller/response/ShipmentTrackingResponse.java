package com.shop.platform.logistics.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.logistics.model.ShipmentDirection;
import com.shop.platform.logistics.model.ShipmentStatus;
import com.shop.platform.logistics.service.ShipmentTracking;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * 单个包裹的轨迹出参。不含内部治理字段（userId / shopId / 包裹主键 / 去重键），
 * 展示文案（状态中文名、节点图标）留给前端投影，后端只给标准词表。
 *
 * <p>{@code direction} 让前端把正向派送与退货回寄分成两段展示（订单里既可能有一发一退）。
 */
public record ShipmentTrackingResponse(
        @Schema(requiredMode = REQUIRED) ShipmentDirection direction,
        @Schema(requiredMode = REQUIRED) String carrierName,
        @Schema(requiredMode = REQUIRED) String trackingNo,
        @Schema(requiredMode = REQUIRED) ShipmentStatus status,
        @Schema(requiredMode = REQUIRED) OffsetDateTime shippedAt,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime deliveredAt,
        @Schema(requiredMode = REQUIRED) List<TrackingNodeResponse> nodes) {

    public static ShipmentTrackingResponse from(ShipmentTracking tracking) {
        return new ShipmentTrackingResponse(
                tracking.shipment().getDirection(),
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
