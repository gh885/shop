package com.shop.platform.logistics.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.logistics.mapper.ShipmentIssue;
import com.shop.platform.logistics.model.ShipmentIssueStatus;
import com.shop.platform.logistics.model.ShipmentIssueType;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 物流异常单出参（客服待办）：人话 detail 直接可念，listing 里不给内部投影列。 */
@Schema(name = "ShipmentIssueResponse")
public record ShipmentIssueView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID shipmentId,
        @Schema(requiredMode = REQUIRED) ShipmentIssueType type,
        @Schema(requiredMode = REQUIRED) ShipmentIssueStatus status,
        @Schema(requiredMode = REQUIRED, nullable = true) String detail,
        @Schema(requiredMode = REQUIRED) OffsetDateTime detectedAt,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime resolvedAt) {

    public static ShipmentIssueView from(ShipmentIssue issue) {
        return new ShipmentIssueView(
                issue.getId(),
                issue.getShipmentId(),
                issue.getType(),
                issue.getStatus(),
                issue.getDetail(),
                issue.getDetectedAt(),
                issue.getResolvedAt());
    }
}
