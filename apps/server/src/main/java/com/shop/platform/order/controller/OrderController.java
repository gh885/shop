package com.shop.platform.order.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.infra.web.CurrentUser;
import com.shop.platform.order.controller.response.CreatedTradeResponse;
import com.shop.platform.order.controller.response.PreviewResponse;
import com.shop.platform.order.dto.CancelOrderRequest;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.PreviewOrderRequest;
import com.shop.platform.order.dto.TradeQuery;
import com.shop.platform.order.service.CreatedTradeView;
import com.shop.platform.order.service.OrderDetailView;
import com.shop.platform.order.service.OrderPlacementService;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.order.service.OrderTransitionService;
import com.shop.platform.order.service.TradeListItemView;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
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
 *
 * <p>出参按「二选一」分两堆，都不碰 mapper 实体（实体内部状态如 updatedAt 不外泄）：结算预览与创建订单要变形
 * （跨服务聚合派生）故用本类的 Response record；列表与详情直出 service 包形状
 * （{@code OrderListItemView} / {@code OrderDetailView}，无独立 Response 镜像）——它们本身就是 wire 契约，
 * 字段只减不增，变更等于改接口，靠 openapi 契约 + 前端 SDK 编译期兜底。
 */
@Tag(name = "orders", description = "买家订单（全部需登录）")
@RestController
@RequestMapping("/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    private final OrderPlacementService orderPlacementService;

    private final OrderTransitionService orderTransitionService;

    /** 结算预览：按店分组算钱（拆单预告）+ 失效行置灰 + 地址可选回显。只读幂等 */
    @PostMapping("/preview")
    public PreviewResponse previewOrder(@CurrentUser UUID userId, @Valid @RequestBody PreviewOrderRequest req) {
        return PreviewResponse.from(orderService.preview(userId, req));
    }

    /** 创建订单：一次结算落一张主订单 + 按店铺拆 N 张子订单，全成全败；同一 checkoutKey 重复提交返回原单。
     * 路径刻意避开裸 POST /orders —— 买家端有同名页面路由，Vite 代理只放行 /orders/ 前缀（见 web vite.config） */
    @PostMapping("/create")
    @ResponseStatus(HttpStatus.CREATED)
    public CreatedTradeResponse createOrder(@CurrentUser UUID userId, @Valid @RequestBody CreateOrderRequest req) {
        return new CreatedTradeResponse(CreatedTradeView.from(orderPlacementService.place(userId, req)));
    }

    /** 我的订单分页：以主订单为单位（一次结算一张卡），可按主进度页签筛选；每张卡内嵌子订单与行项免二次请求。同上避让页面路由 */
    @GetMapping("/trades/mine")
    public PageResult<TradeListItemView> listMyTrades(
            @CurrentUser UUID userId, @Valid PageParams pageParams, @Valid TradeQuery query) {
        return orderService.pageMyTrades(userId, query.progress(), pageParams);
    }

    /** 主订单详情：收银台要「这一笔总共多少钱、拆成哪几单」，与列表行同一形状 */
    @GetMapping("/trades/{id}")
    public TradeListItemView getTradeDetail(@CurrentUser UUID userId, @PathVariable UUID id) {
        return orderService.tradeDetail(userId, id);
    }

    /** 订单详情：含收货快照、物流、各状态时间戳 */
    @GetMapping("/{id}")
    public OrderDetailView getOrderDetail(@CurrentUser UUID userId, @PathVariable UUID id) {
        return orderService.detail(userId, id);
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

    /**
     * 延长确认收货：收货窗口 +7 天，额度 1 次（ORD-63）。
     *
     * <p>不带请求体：额度和天数是服务端常量（{@code OrderTimeouts}），由客户端传就成了可被改写的业务规则。
     */
    @PutMapping("/{id}/receive/extend")
    public void extendReceive(@CurrentUser UUID userId, @PathVariable UUID id) {
        orderTransitionService.extendReceive(userId, id);
    }
}
