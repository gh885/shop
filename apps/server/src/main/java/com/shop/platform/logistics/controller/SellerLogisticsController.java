package com.shop.platform.logistics.controller;

import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentShop;
import com.shop.platform.logistics.controller.response.CreatedShipmentResponse;
import com.shop.platform.logistics.dto.CreateShipmentRequest;
import com.shop.platform.logistics.model.ShipmentStatus;
import com.shop.platform.logistics.service.CarrierView;
import com.shop.platform.logistics.service.DispatchShipmentCommand;
import com.shop.platform.logistics.service.ShipmentService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家发货作业（授权要求 ORDER_FULFILL，与订单作业同权）。shopId 从店铺上下文（X-Shop-Id）取，前端不传店 ID；
 * 越店操作在 service 层按 shop_id 校验，一律 404。
 *
 * <p>发货入口在物流模块而不是订单模块：发货是物流动作，包裹与运单号是它的产物，
 * 订单状态是它经 {@code order :: api} 推着走的（规则见 docs/business-rules/logistics.md LOG-01、LOG-02）。
 * 路径前缀仍是 /seller，与角色分端一致——模块按领域切，不按角色切。
 *
 * <p>两步是刻意的：录单（选行 + 填单号）只占住这批货，交寄才是货离手、累计发货量的时刻。
 * 承运商揽收推送会替卖家自动交寄，忘点不会把单卡住。
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
    public List<CarrierView> listCarriers() {
        return shipmentService.enabledCarriers().stream().map(CarrierView::from).toList();
    }

    /** 录单：落一张待发货包裹 + 发货单行，返回包裹主键（交寄与取消都按它操作） */
    @PostMapping("/shipments")
    @ResponseStatus(HttpStatus.CREATED)
    public CreatedShipmentResponse createShipment(
            @CurrentShop UUID shopId, @Valid @RequestBody CreateShipmentRequest req) {
        UUID shipmentId = shipmentService.record(new DispatchShipmentCommand(
                shopId,
                req.orderId(),
                req.carrierCode(),
                req.trackingNo(),
                req.lines().stream()
                        .map(l -> new DispatchShipmentCommand.Line(l.orderItemId(), l.quantity()))
                        .toList()));
        return new CreatedShipmentResponse(shipmentId, ShipmentStatus.PENDING_DISPATCH);
    }

    /** 交寄：货交给承运商，累计发货量并与订单履约态同事务推进 */
    @PostMapping("/shipments/{id}/dispatch")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void dispatchShipment(@CurrentShop UUID shopId, @PathVariable UUID id) {
        shipmentService.dispatch(shopId, id);
    }

    /** 取消包裹：待发货释放名额，已发出回退有效发货量；已签收不可取消 */
    @PostMapping("/shipments/{id}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancelShipment(@CurrentShop UUID shopId, @PathVariable UUID id) {
        shipmentService.cancel(shopId, id);
    }
}
