package com.shop.platform.order.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentShop;
import com.shop.platform.order.controller.response.OrderDetailResponse;
import com.shop.platform.order.controller.response.SellerOrderListItemResponse;
import com.shop.platform.order.dto.OrderQuery;
import com.shop.platform.order.dto.ShipOrderRequest;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.order.service.OrderTransitionService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家订单管理（授权要求 ORDER_FULFILL，读随写权）。shopId 从店铺上下文（X-Shop-Id，ShopMembershipFilter 校验成员身份）取，
 * 前端不传店 ID；越店访问在 service 层按 shop_id 过滤/校验，一律 404。
 */
@Tag(name = "seller-orders", description = "卖家订单管理")
@RestController
@RequestMapping("/seller/orders")
@RequiredArgsConstructor
@RequirePermission(Permissions.ORDER_FULFILL)
public class SellerOrderController {

    private final OrderService orderService;

    private final OrderTransitionService orderTransitionService;

    /** 本店订单分页：status 筛选待发货等作业 tab */
    @GetMapping
    public PageResult<SellerOrderListItemResponse> listShopOrders(
            @CurrentShop UUID shopId, @Valid PageParams pageParams, @Valid OrderQuery query) {
        return orderService.pageSeller(shopId, query.status(), pageParams).map(SellerOrderListItemResponse::from);
    }

    /** 本店订单详情：收货快照即打包面单信息（与买家侧共用契约，动作集取卖家视角） */
    @GetMapping("/{id}")
    public OrderDetailResponse getShopOrderDetail(@CurrentShop UUID shopId, @PathVariable UUID id) {
        return OrderDetailResponse.sellerView(orderService.sellerDetail(shopId, id));
    }

    /** 发货：待发货 → 已发货，回填物流公司 + 运单号 */
    @PutMapping("/{id}/ship")
    public void shipOrder(@CurrentShop UUID shopId, @PathVariable UUID id, @Valid @RequestBody ShipOrderRequest req) {
        orderTransitionService.ship(shopId, id, req);
    }
}
