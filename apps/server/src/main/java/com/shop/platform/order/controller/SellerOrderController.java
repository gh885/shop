package com.shop.platform.order.controller;

import com.shop.platform.common.Money;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentShop;
import com.shop.platform.order.dto.OrderQuery;
import com.shop.platform.order.dto.ShipOrderRequest;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.order.service.OrderTransitionService;
import com.shop.platform.order.service.OrderWithItems;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
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

    /** 同意售后：按售后类型分派——仅退款 APPLYING→REFUNDED 一步退；退货退款 APPLYING→RETURNING 进入退货流程 */
    @PutMapping("/{id}/after-sales/agree")
    public void agreeAfterSale(@CurrentShop UUID shopId, @PathVariable UUID id) {
        orderTransitionService.agreeAfterSale(shopId, id);
    }

    /** 拒绝售后：APPLYING → REJECTED */
    @PutMapping("/{id}/after-sales/reject")
    public void rejectAfterSale(@CurrentShop UUID shopId, @PathVariable UUID id) {
        orderTransitionService.rejectAfterSale(shopId, id);
    }

    /** 确认收到退货（仅退货退款、退货中）：RETURNING → REFUNDED，回补库存并退款 */
    @PutMapping("/{id}/after-sales/receive")
    public void receiveReturn(@CurrentShop UUID shopId, @PathVariable UUID id) {
        orderTransitionService.receiveReturn(shopId, id);
    }

    // ---- 出参形状 ----

    /** 列表卡片：买家收货人摘要 + 行项目数，发货作业先扫一眼再进详情；详情与买家侧共用 OrderDetailResponse */
    public record SellerOrderListItemResponse(
            UUID id,
            String orderNo,
            OrderStatus status,
            Money payAmount,
            String receiverName,
            long itemCount,
            OffsetDateTime createdAt) {

        static SellerOrderListItemResponse from(OrderWithItems o) {
            Order order = o.order();
            return new SellerOrderListItemResponse(
                    order.getId(),
                    order.getOrderNo(),
                    order.getStatus(),
                    order.payAmountAsMoney(),
                    order.getReceiverName(),
                    o.items().size(),
                    order.getCreatedAt());
        }
    }
}
