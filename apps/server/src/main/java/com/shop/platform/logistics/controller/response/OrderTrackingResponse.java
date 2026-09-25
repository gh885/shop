package com.shop.platform.logistics.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.logistics.service.OrderTracking;
import com.shop.platform.logistics.service.ShipmentTrackingView;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/**
 * 订单物流出参（买家/卖家共用）：一笔订单的<b>全部</b>包裹，各带轨迹节点。
 *
 * <p>为什么是列表：一单多包裹是常态（拆包/分批发），展示顺序 = 发货先后，
 * 首个包裹即订单摘要里的那个（订单上的 logistics_company / tracking_no 投影口径）。
 */
public record OrderTrackingResponse(
        @Schema(requiredMode = REQUIRED) UUID orderId,
        @Schema(requiredMode = REQUIRED) List<ShipmentTrackingView> shipments) {

    public static OrderTrackingResponse from(OrderTracking tracking) {
        return new OrderTrackingResponse(
                tracking.orderId(),
                tracking.shipments().stream().map(ShipmentTrackingView::from).toList());
    }
}
