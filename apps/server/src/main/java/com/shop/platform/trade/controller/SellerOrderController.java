package com.shop.platform.trade.controller;

import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.trade.service.SellerOrderQuery;
import com.shop.platform.trade.service.SellerOrderQuery.OrderDetail;
import com.shop.platform.trade.service.SellerOrderQuery.OrderPage;
import com.shop.platform.trade.service.SellerOrderQuery.ReceiverPhone;
import java.util.Set;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家侧订单入口。
 *
 * <p><b>它补的是一个断掉的入口，不是一个新功能。</b> 发货（{@code POST /api/seller/orders/{id}/shipments}）
 * 与看包裹都要 {@code sellerOrderId} 作为路径参数，而在这个 controller 之前，
 * 商家没有任何办法拿到那个 id——接口都在，入口没有，整条发货链路在前端不可达。
 *
 * <p><b>判权用 {@code ORDER_READ}。</b> 看订单是读操作，与发货（同样 {@code ORDER_READ}，
 * 见 {@code SellerShipmentController}）同一个点。没有拆成「看」和「发」两个点，
 * 是因为它们的事实前提相同：能看见这单，才能对它做动作。
 *
 * <p><b>归属由 SQL 保证，不由这里比对。</b> {@code merchantId} 从令牌来，写进每条 SQL 的
 * {@code WHERE}。别家的单查出空集，折 404——403 本身就是「这个 id 存在」的确认。
 * 店铺范围（{@code shopIds}）同样从令牌快照来，一并传给 service 收窄：主账号是全部店铺，
 * 子账号只有授权的那些店。
 */
@RestController
@RequestMapping("/api/seller/orders")
public class SellerOrderController {

    /** 列表默认 20 条，最多 100——不设上限等于给一个拉全表的入口。 */
    private static final int MAX_PAGE_SIZE = 100;

    private final SellerOrderQuery orders;
    private final Authorizer authorizer;

    public SellerOrderController(SellerOrderQuery orders, Authorizer authorizer) {
        this.orders = orders;
        this.authorizer = authorizer;
    }

    /**
     * 我的订单列表。按子单列，不按订单组——一个买家跨三家店下单，三家店各看各的那一份。
     *
     * @param status 展示态：{@code pending_payment} / {@code awaiting_shipment} /
     *     {@code partially_shipped} / {@code shipped} / {@code received} / {@code closed}；
     *     不传看全部。**与买家侧不是同一套词**：商家关心「要不要发货」，买家关心「付没付钱」。
     * @param cursor 上一页的 {@code nextCursor}
     * @param limit 服务端 clamp 到 1–100
     */
    @GetMapping
    public OrderPage listSellerOrders(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "20") int limit) {
        authorizer.check(Permission.ORDER_READ);
        return orders.page(merchantId(), shopIds(), status, cursor, Math.clamp(limit, 1, MAX_PAGE_SIZE));
    }

    /**
     * 一张子单的详情。手机号**已脱敏**。
     *
     * <p>要完整号码走 {@code POST /{sellerOrderId}/receiver-phone}——那是独立动作，
     * 能单独限流、单独审计，将来也能换成「打码通话」而不动这个页面。
     */
    @GetMapping("/{sellerOrderId}")
    public OrderDetail sellerOrderDetail(@PathVariable UUID sellerOrderId) {
        authorizer.check(Permission.ORDER_READ);
        return orders.detail(sellerOrderId, merchantId(), shopIds());
    }

    /**
     * 发货用的收件人手机号。**唯一给完整号码的入口。**
     *
     * <p>用 POST 而不是 GET，尽管它不改任何状态：GET 会被浏览器预取、被代理缓存、被日志记下
     * 完整 URL，而这个响应体里是买家的手机号。POST 至少让它不会被顺手缓存。
     *
     * <p>返回 {@code {receiverName, phone}} 而不是只返回号码：商家打印面单时要的是「谁收」+「怎么联系」，
     * 分两次请求只会多一次往返。
     */
    @PostMapping("/{sellerOrderId}/receiver-phone")
    public ReceiverPhone receiverPhone(@PathVariable UUID sellerOrderId) {
        authorizer.check(Permission.ORDER_READ);
        return orders.receiverPhone(sellerOrderId, merchantId(), shopIds());
    }

    /**
     * 当前商家。卖家身份解析时 {@code merchantId} 一定非空（见 {@code SellerOperatorResolver}），
     * 这里显式取而不是让它自动拆箱——空值该是一个明确的 500，不是一个 NullPointerException。
     */
    private UUID merchantId() {
        return authorizer.current().merchantId();
    }

    /** 操作人的店铺范围：主账号 = 全部店铺（含已关店），子账号 = operator_shop 授权店。 */
    private Set<UUID> shopIds() {
        return authorizer.current().shopIds();
    }
}
