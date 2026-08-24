package com.shop.platform.order.controller;

import com.shop.platform.common.Money;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.ShopIdHolder;
import com.shop.platform.order.dto.OrderQuery;
import com.shop.platform.order.dto.ShipOrderRequest;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.order.service.OrderWithItems;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家订单管理。shopId 从店铺上下文（X-Shop-Id，ShopMembershipFilter 校验成员身份）取，
 * 前端不传店 ID；越店访问在 service 层按 shop_id 过滤/校验，一律 404。
 */
@RestController
@RequestMapping("/seller/orders")
@RequiredArgsConstructor
public class SellerOrderController {

    private final OrderService orderService;

    /** 本店订单分页：status 筛选待发货等作业 tab */
    @GetMapping
    public PageResult<SellerOrderListItemResponse> list(@Valid PageParams pageParams, @Valid OrderQuery query) {
        PageResult<OrderWithItems> page = orderService.pageSeller(ShopIdHolder.get(), query.status(), pageParams);
        return new PageResult<>(
                page.records().stream().map(SellerOrderListItemResponse::from).toList(), page.total());
    }

    /** 本店订单详情：收货快照即打包面单信息 */
    @GetMapping("/{id}")
    public SellerOrderDetailResponse detail(@PathVariable UUID id) {
        return SellerOrderDetailResponse.from(orderService.sellerDetail(ShopIdHolder.get(), id));
    }

    /** 发货：待发货 → 已发货，回填物流公司 + 运单号 */
    @PutMapping("/{id}/ship")
    public void ship(@PathVariable UUID id, @Valid @RequestBody ShipOrderRequest req) {
        orderService.ship(ShopIdHolder.get(), id, req);
    }

    // ---- 出参形状 ----

    /** 列表卡片：买家收货人摘要 + 行项目数，发货作业先扫一眼再进详情 */
    public record SellerOrderListItemResponse(
            UUID id,
            String orderNo,
            String status,
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

    /** 详情出参：镜像买家详情的卖方视角（不含 buyerMessage 以外的买家私有字段？留言本身卖家可见） */
    public record SellerOrderDetailResponse(
            UUID id,
            String orderNo,
            String status,
            List<String> availableActions,
            Money itemAmount,
            Money shippingFee,
            Money payAmount,
            String buyerMessage,
            String receiverName,
            String receiverPhone,
            String receiverProvince,
            String receiverCity,
            String receiverDistrict,
            String receiverDetail,
            String logisticsCompany,
            String trackingNo,
            OffsetDateTime paidAt,
            OffsetDateTime shippedAt,
            OffsetDateTime completedAt,
            OffsetDateTime cancelledAt,
            String cancelReason,
            OffsetDateTime createdAt,
            List<Item> items) {

        public record Item(UUID skuId, String name, String image, Money price, Integer quantity, Money amount) {}

        static SellerOrderDetailResponse from(OrderWithItems o) {
            Order order = o.order();
            List<Item> items = o.items().stream()
                    .map(i -> new Item(
                            i.getSkuId(),
                            i.getName(),
                            i.getImage(),
                            i.priceAsMoney(),
                            i.getQuantity(),
                            i.amountAsMoney()))
                    .toList();
            return new SellerOrderDetailResponse(
                    order.getId(),
                    order.getOrderNo(),
                    order.getStatus(),
                    order.sellerActions(),
                    order.itemAmountAsMoney(),
                    order.shippingFeeAsMoney(),
                    order.payAmountAsMoney(),
                    order.getBuyerMessage(),
                    order.getReceiverName(),
                    order.getReceiverPhone(),
                    order.getReceiverProvince(),
                    order.getReceiverCity(),
                    order.getReceiverDistrict(),
                    order.getReceiverDetail(),
                    order.getLogisticsCompany(),
                    order.getTrackingNo(),
                    order.getPaidAt(),
                    order.getShippedAt(),
                    order.getCompletedAt(),
                    order.getCancelledAt(),
                    order.getCancelReason(),
                    order.getCreatedAt(),
                    items);
        }
    }
}
