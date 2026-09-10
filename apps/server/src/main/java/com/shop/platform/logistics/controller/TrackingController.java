package com.shop.platform.logistics.controller;

import com.shop.platform.infra.web.CurrentUser;
import com.shop.platform.logistics.controller.response.OrderTrackingResponse;
import com.shop.platform.logistics.service.ShipmentService;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家物流轨迹。路径挂在订单资源下（"哪个订单的物流"是买家的心智模型），由本模块承接——
 * 与 aftersale 的 {@code /orders/{id}/after-sales} 同一手法：读写各自归其 owning 模块，order 不承担转发。
 *
 * <p>需登录（不在 JwtAuthFilter skipPaths 内，未登录 401）；归属在 service 层按包裹的 user_id 过闸，
 * 越权与不存在同话术。
 */
@Tag(name = "logistics", description = "物流轨迹（买家）")
@RestController
@RequestMapping("/orders")
@RequiredArgsConstructor
public class TrackingController {

    private final ShipmentService shipmentService;

    /** 订单物流轨迹（一单多包裹）：尚未发货（或物流模块上线前的历史单）给 404「暂无物流信息」 */
    @GetMapping("/{id}/tracking")
    public OrderTrackingResponse getOrderTracking(@CurrentUser UUID userId, @PathVariable UUID id) {
        return OrderTrackingResponse.from(shipmentService.trackingOfOrder(userId, id));
    }
}
