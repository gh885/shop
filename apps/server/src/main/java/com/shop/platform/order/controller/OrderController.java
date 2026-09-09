package com.shop.platform.order.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.infra.web.CurrentUser;
import com.shop.platform.order.controller.response.CreatedOrder;
import com.shop.platform.order.controller.response.CreatedOrdersResponse;
import com.shop.platform.order.controller.response.OrderDetailResponse;
import com.shop.platform.order.controller.response.OrderListItemResponse;
import com.shop.platform.order.controller.response.PreviewResponse;
import com.shop.platform.order.dto.CancelOrderRequest;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderQuery;
import com.shop.platform.order.dto.PreviewOrderRequest;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.order.service.OrderTransitionService;
import com.shop.platform.order.service.OrderWithItems;
import com.shop.platform.shop.api.ShopReadQuery;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家订单。全部接口要求登录（不在 JwtAuthFilter skipPaths 内，未登录 401）。
 *
 * <p>支付入口不在本控制器——POST /payments 由 payment 模块承接，本模块经事件感知支付结果。
 * 售后入口也不在本控制器——/orders/{id}/after-sales 由 aftersale 模块承接（同 tag，SDK 里仍归 OrdersApi）。
 * 出参一律 Response record：快照字段只减不增，实体内部状态（updatedAt 等）不外泄。
 */
@Tag(name = "orders", description = "买家订单（全部需登录）")
@RestController
@RequestMapping("/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    private final OrderTransitionService orderTransitionService;

    private final ShopReadQuery shopReadQuery;

    /** 结算预览：按店分组算钱（拆单预告）+ 失效行置灰 + 地址可选回显。只读幂等 */
    @PostMapping("/preview")
    public PreviewResponse previewOrder(@CurrentUser UUID userId, @Valid @RequestBody PreviewOrderRequest req) {
        return PreviewResponse.from(orderService.preview(userId, req));
    }

    /** 创建订单：一次结算按店铺拆 N 单，全成全败；返回全部新单供逐单倒计时付款。
     * 路径刻意避开裸 POST /orders —— 买家端有同名页面路由，Vite 代理只放行 /orders/ 前缀（见 web vite.config） */
    @PostMapping("/create")
    @ResponseStatus(HttpStatus.CREATED)
    public CreatedOrdersResponse createOrder(@CurrentUser UUID userId, @Valid @RequestBody CreateOrderRequest req) {
        return new CreatedOrdersResponse(orderService.create(userId, req).stream()
                .map(CreatedOrder::from)
                .toList());
    }

    /** 我的订单分页：status 对应「待付款/待发货…」tab，每单内嵌行项免二次请求。同上避让页面路由 */
    @GetMapping("/mine")
    public PageResult<OrderListItemResponse> listMyOrders(
            @CurrentUser UUID userId, @Valid PageParams pageParams, @Valid OrderQuery query) {
        PageResult<OrderWithItems> page = orderService.pageMine(userId, query.status(), pageParams);
        // 店名批量点查（shop :: api）：列表多单多店，集中拼一次
        Map<UUID, String> shopNames = shopReadQuery.namesByIds(
                page.records().stream().map(o -> o.order().getShopId()).toList());
        return page.map(o -> OrderListItemResponse.from(o, shopNames));
    }

    /** 订单详情：含收货快照、物流、各状态时间戳 */
    @GetMapping("/{id}")
    public OrderDetailResponse getOrderDetail(@CurrentUser UUID userId, @PathVariable UUID id) {
        OrderWithItems detail = orderService.detail(userId, id);
        String shopName = shopReadQuery
                .namesByIds(List.of(detail.order().getShopId()))
                .get(detail.order().getShopId());
        return OrderDetailResponse.buyerView(detail, shopName);
    }

    /** 取消订单：仅待付款/待发货可取消，取消即回补库存 */
    @PutMapping("/{id}/cancel")
    public void cancelOrder(
            @CurrentUser UUID userId, @PathVariable UUID id, @Valid @RequestBody CancelOrderRequest req) {
        orderTransitionService.cancel(userId, id, req.reason());
    }

    /** 确认收货：已发货 → 已完成 */
    @PutMapping("/{id}/receive")
    public void receiveOrder(@CurrentUser UUID userId, @PathVariable UUID id) {
        orderTransitionService.receive(userId, id);
    }
}
