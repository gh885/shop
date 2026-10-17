package com.shop.platform.logistics.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.logistics.model.ShipmentStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

/**
 * 录单结果：落成的包裹主键 + 当前状态（恒为「待发货」）。
 *
 * <p>主键必须回给卖家：交寄与取消都按包裹 id 操作，没有它就接不上下一步。
 */
@Schema(name = "ShipmentCreatedResponse")
public record CreatedShipmentResponse(
        @Schema(requiredMode = REQUIRED) UUID id, @Schema(requiredMode = REQUIRED) ShipmentStatus status) {}
