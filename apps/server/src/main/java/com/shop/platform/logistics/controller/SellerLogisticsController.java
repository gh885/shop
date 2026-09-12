package com.shop.platform.logistics.controller;

import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentShop;
import com.shop.platform.logistics.controller.response.CarrierResponse;
import com.shop.platform.logistics.dto.CreateShipmentRequest;
import com.shop.platform.logistics.service.DispatchShipmentCommand;
import com.shop.platform.logistics.service.ShipmentService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家发货作业（授权要求 ORDER_FULFILL，与订单作业同权）。shopId 从店铺上下文（X-Shop-Id）取，前端不传店 ID；
 * 越店发货在 service 层按 shop_id 校验，一律 404。
 *
 * <p>发货入口在物流模块而不是订单模块：发货是物流动作，包裹与运单号是它的产物，
 * 订单状态是它经 {@code order :: api} 推着走的（设计见 docs/decisions/logistics.md §4 二期）。
 * 路径前缀仍是 /seller，与角色分端一致——模块按领域切，不按角色切。
 */
@Tag(name = "seller-logistics", description = "卖家发货作业")
@RestController
@RequestMapping("/seller")
@RequiredArgsConstructor
@RequirePermission(Permissions.ORDER_FULFILL)
public class SellerLogisticsController {

    private final ShipmentService shipmentService;

    /** 可选快递公司（发货下拉）：只给启用的，按字典排序 */
    @GetMapping("/carriers")
    public List<CarrierResponse> listCarriers() {
        return shipmentService.enabledCarriers().stream()
                .map(CarrierResponse::from)
                .toList();
    }

    /** 发货：落一个包裹并推进订单（首次发货 PAID → 已发货，再次发货只追加包裹） */
    @PostMapping("/shipments")
    @ResponseStatus(HttpStatus.CREATED)
    public void createShipment(@CurrentShop UUID shopId, @Valid @RequestBody CreateShipmentRequest req) {
        shipmentService.dispatch(
                new DispatchShipmentCommand(shopId, req.orderId(), req.carrierCode(), req.trackingNo()));
    }
}
