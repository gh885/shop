package com.shop.platform.order.controller;

import com.shop.platform.common.Money;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.UserIdHolder;
import com.shop.platform.order.dto.ApplyAfterSaleRequest;
import com.shop.platform.order.dto.CancelOrderRequest;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderQuery;
import com.shop.platform.order.dto.PreviewOrderRequest;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.service.CheckoutPreview;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.order.service.OrderTransitionService;
import com.shop.platform.order.service.OrderWithItems;
import com.shop.platform.order.service.ValidLine;
import com.shop.platform.shop.api.ShopReadQuery;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
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
    public PreviewResponse previewOrder(@Valid @RequestBody PreviewOrderRequest req) {
        return PreviewResponse.from(orderService.preview(UserIdHolder.get(), req));
    }

    /** 创建订单：一次结算按店铺拆 N 单，全成全败；返回全部新单供逐单倒计时付款。
     * 路径刻意避开裸 POST /orders —— 买家端有同名页面路由，Vite 代理只放行 /orders/ 前缀（见 web vite.config） */
    @PostMapping("/create")
    @ResponseStatus(HttpStatus.CREATED)
    public CreatedOrdersResponse createOrder(@Valid @RequestBody CreateOrderRequest req) {
        return new CreatedOrdersResponse(orderService.create(UserIdHolder.get(), req).stream()
                .map(CreatedOrder::from)
                .toList());
    }

    /** 我的订单分页：status 对应「待付款/待发货…」tab，每单内嵌行项免二次请求。同上避让页面路由 */
    @GetMapping("/mine")
    public PageResult<OrderListItemResponse> listMyOrders(@Valid PageParams pageParams, @Valid OrderQuery query) {
        PageResult<OrderWithItems> page = orderService.pageMine(UserIdHolder.get(), query.status(), pageParams);
        // 店名批量点查（shop :: api）：列表多单多店，集中拼一次
        Map<UUID, String> shopNames = shopReadQuery.namesByIds(
                page.records().stream().map(o -> o.order().getShopId()).toList());
        return new PageResult<>(
                page.records().stream()
                        .map(o -> OrderListItemResponse.from(o, shopNames))
                        .toList(),
                page.total());
    }

    /** 订单详情：含收货快照、物流、各状态时间戳 */
    @GetMapping("/{id}")
    public OrderDetailResponse getOrderDetail(@PathVariable UUID id) {
        OrderWithItems detail = orderService.detail(UserIdHolder.get(), id);
        String shopName = shopReadQuery
                .namesByIds(List.of(detail.order().getShopId()))
                .get(detail.order().getShopId());
        return OrderDetailResponse.buyerView(detail, shopName);
    }

    /** 取消订单：仅待付款/待发货可取消，取消即回补库存 */
    @PutMapping("/{id}/cancel")
    public void cancelOrder(@PathVariable UUID id, @Valid @RequestBody CancelOrderRequest req) {
        orderTransitionService.cancel(UserIdHolder.get(), id, req.reason());
    }

    /** 确认收货：已发货 → 已完成 */
    @PutMapping("/{id}/receive")
    public void receiveOrder(@PathVariable UUID id) {
        orderTransitionService.receive(UserIdHolder.get(), id);
    }

    /** 申请售后：仅「已完成」且申请窗口未过可发起（售后线独立于履约主状态机） */
    @PostMapping("/{id}/after-sales")
    @ResponseStatus(HttpStatus.CREATED)
    public void applyAfterSale(@PathVariable UUID id, @Valid @RequestBody ApplyAfterSaleRequest req) {
        orderTransitionService.applyAfterSale(UserIdHolder.get(), id, req.type(), req.reason());
    }

    /** 撤销售后申请：APPLYING → CLOSED */
    @PutMapping("/{id}/after-sales/cancel")
    public void cancelAfterSale(@PathVariable UUID id) {
        orderTransitionService.cancelAfterSale(UserIdHolder.get(), id);
    }

    // ---- 出参形状 ----

    /** 结算预览出参，镜像 service 形状 CheckoutPreview，金额走 Money（amount + currency） */
    public record PreviewResponse(
            List<Group> groups, List<UnavailableLine> unavailable, Address address, Money totalPayAmount) {

        static PreviewResponse from(CheckoutPreview p) {
            return new PreviewResponse(
                    p.groups().stream().map(Group::from).toList(),
                    p.unavailable().stream()
                            .map(u -> new UnavailableLine(u.skuId(), u.name(), u.image(), u.quantity(), u.cause()))
                            .toList(),
                    p.address() != null ? Address.from(p.address()) : null,
                    p.totalPayAmount());
        }

        public record Group(
                UUID shopId, String shopName, List<Item> lines, Money itemAmount, Money shippingFee, Money payAmount) {

            static Group from(CheckoutPreview.Group g) {
                return new Group(
                        g.shopId(),
                        g.shopName(),
                        g.lines().stream().map(Item::from).toList(),
                        g.itemAmount(),
                        g.shippingFee(),
                        g.payAmount());
            }
        }

        public record Item(
                UUID skuId,
                UUID productId,
                String name,
                String image,
                Money price,
                Money originalPrice,
                Integer quantity,
                Integer stock) {

            static Item from(ValidLine l) {
                return new Item(
                        l.skuId(),
                        l.productId(),
                        l.name(),
                        l.image(),
                        l.price(),
                        l.originalPrice(),
                        l.quantity(),
                        l.stock());
            }
        }

        public record UnavailableLine(UUID skuId, String name, String image, Integer quantity, String cause) {}

        public record Address(
                UUID id,
                String receiverName,
                String receiverPhone,
                String province,
                String city,
                String district,
                String detail) {

            static Address from(CheckoutPreview.Address a) {
                return new Address(
                        a.id(),
                        a.snapshot().receiverName(),
                        a.snapshot().receiverPhone(),
                        a.snapshot().province(),
                        a.snapshot().city(),
                        a.snapshot().district(),
                        a.snapshot().detail());
            }
        }
    }

    /** 创建结果：拆出的全部新单，payExpireAt 供前端倒计时 */
    public record CreatedOrdersResponse(List<CreatedOrder> orders) {}

    public record CreatedOrder(UUID id, String orderNo, UUID shopId, Money payAmount, OffsetDateTime payExpireAt) {

        static CreatedOrder from(Order o) {
            return new CreatedOrder(o.getId(), o.getOrderNo(), o.getShopId(), o.payAmountAsMoney(), o.getPayExpireAt());
        }
    }

    /** 列表卡片：够渲染一行订单即可；详情页独有的大字段（地址/物流/留言）不进列表 */
    public record OrderListItemResponse(
            UUID id,
            String orderNo,
            String status,
            UUID shopId,
            String shopName,
            Money payAmount,
            OffsetDateTime payExpireAt,
            OffsetDateTime createdAt,
            List<OrderItemResponse> items) {

        static OrderListItemResponse from(OrderWithItems o, Map<UUID, String> shopNames) {
            return new OrderListItemResponse(
                    o.order().getId(),
                    o.order().getOrderNo(),
                    o.order().getStatus().name(),
                    o.order().getShopId(),
                    shopNames.getOrDefault(o.order().getShopId(), ""),
                    o.order().payAmountAsMoney(),
                    o.order().getPayExpireAt(),
                    o.order().getCreatedAt(),
                    o.items().stream().map(OrderItemResponse::from).toList());
        }
    }
}
