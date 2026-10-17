package com.shop.platform.logistics.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.logistics.model.ShipmentDirection;
import com.shop.platform.logistics.model.ShipmentStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * 单个包裹的轨迹出参。不含内部治理字段（userId / shopId / 包裹主键 / 去重键），
 * 展示文案（状态中文名、节点图标）留给前端投影，后端只给标准词表。
 *
 * <p>{@code direction} 让前端把正向派送与退货回寄分成两段展示（订单里既可能有一发一退）。
 * {@code shippedAt} 在待发货时为空，{@code signedAt} 未签收时为空——两者与 {@code status} 同源（时间戳镜像）。
 */
@Schema(name = "ShipmentTrackingResponse")
public record ShipmentTrackingView(
        @Schema(requiredMode = REQUIRED) ShipmentDirection direction,
        @Schema(requiredMode = REQUIRED) String carrierName,
        @Schema(requiredMode = REQUIRED) String trackingNo,
        @Schema(requiredMode = REQUIRED) ShipmentStatus status,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime shippedAt,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime signedAt,
        @Schema(requiredMode = REQUIRED) List<TrackingNodeView> nodes) {

    public static ShipmentTrackingView from(ShipmentTracking tracking) {
        return new ShipmentTrackingView(
                tracking.shipment().getDirection(),
                tracking.shipment().getCarrierName(),
                tracking.shipment().getTrackingNo(),
                tracking.shipment().getStatus(),
                tracking.shipment().getShippedAt(),
                tracking.shipment().getSignedAt(),
                tracking.nodes().stream()
                        .map(n -> new TrackingNodeView(
                                n.getNodeCode(),
                                n.getNodeCode().stage(),
                                n.getDescription(),
                                n.getLocation(),
                                n.getOccurredAt()))
                        .toList());
    }
}
