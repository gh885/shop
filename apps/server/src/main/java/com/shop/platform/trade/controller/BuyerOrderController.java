package com.shop.platform.trade.controller;

import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.web.Idempotency;
import com.shop.platform.payment.api.PaymentView;
import com.shop.platform.trade.api.PlaceOrderRequest;
import com.shop.platform.trade.api.TradeCommand;
import com.shop.platform.trade.dto.CreateOrderRequest;
import com.shop.platform.trade.service.BuyerOrderQuery;
import com.shop.platform.trade.service.PaymentStarter;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家侧订单入口：落单、取消、查详情、查列表。
 *
 * <p><b>落单不接受任何金额，也不接受地址内容。</b> 请求体只有 {@code quoteId} + {@code addressId} +
 * 行号数量；钱从报价单读、地址从地址簿取快照，这条链上任何一处允许前端传内容，
 * 前面的校验就都白做了。
 *
 * <p>不判权限点：买家没有权限体系，边界是「这单是不是我的」。{@code buyerId} 一律从令牌来，
 * 请求体里没有这个字段——让前端传就等于允许替别人下单。归属校验在 service 里做，那才有订单上下文。
 *
 * <p>发货和签收不在这里：那是 fulfillment 和物流轨迹的事，买家点"确认收货"只是其中一条触发路径。
 */
@RestController
@RequestMapping("/api/buyer/orders")
public class BuyerOrderController {

    /** 列表默认 20 条，最多 100——不设上限等于给一个拉全表的入口。 */
    private static final int MAX_PAGE_SIZE = 100;

    private final TradeCommand orders;
    private final BuyerOrderQuery queries;
    private final PaymentStarter paymentStarter;
    private final Authorizer authorizer;
    private final StringRedisTemplate redis;

    public BuyerOrderController(
            TradeCommand orders,
            BuyerOrderQuery queries,
            PaymentStarter paymentStarter,
            Authorizer authorizer,
            StringRedisTemplate redis) {
        this.orders = orders;
        this.queries = queries;
        this.paymentStarter = paymentStarter;
        this.authorizer = authorizer;
        this.redis = redis;
    }

    /**
     * 落单。整条链路一个事务：取地址快照 → 校验报价 → 占库存 → 插三层订单 → 发事件。
     *
     * <p>失败时前端按码分流，四种处理完全不同，不能合成一句"下单失败"：
     *
     * <ul>
     *   <li>{@code PRICE_CHANGED} — 价格变了，弹窗让用户重新确认
     *   <li>{@code QUOTE_EXPIRED} — 报价没了，重新算一次
     *   <li>{@code INSUFFICIENT_STOCK} — 库存不够，改数量
     *   <li>404 — 地址不存在（查无此地址或不归本人，同话术防枚举）
     * </ul>
     */
    @PostMapping
    public TradeCommand.PlacedOrder place(@Valid @RequestBody CreateOrderRequest request) {
        UUID buyerId = authorizer.current().operatorId();
        return orders.placeOrder(toCommand(request, buyerId));
    }

    /**
     * 未付款时取消整单。
     *
     * @return {@code cancelled=false} 表示已经被支付回调或超时任务抢先，什么都没改
     */
    @PostMapping("/{orderGroupId}/cancel")
    public CancelResult cancelOrder(@PathVariable UUID orderGroupId) {
        UUID buyerId = authorizer.current().operatorId();
        return new CancelResult(orderGroupId, orders.cancelUnpaid(orderGroupId, buyerId));
    }

    /**
     * 发起支付。**金额不在请求体里**——它由 {@link PaymentStarter} 从订单读。
     *
     * <p>入口开在 orders 而不是 payments，是因为"该付多少"只有订单持有者知道。
     * 详见 {@link PaymentStarter} 的类注释。
     *
     * <p>支持 {@code Idempotency-Key}：支付响应丢失后的重试原样返回第一次的支付单，
     * 而不是再堆一张单（没带键也有"复用 pending 支付单"兜底，带键是为了把结果带回来）。
     */
    @PostMapping("/{orderGroupId}/pay")
    public ResponseEntity<PaymentView> pay(
            @PathVariable UUID orderGroupId,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        UUID buyerId = authorizer.current().operatorId();
        return Idempotency.execute(
                redis,
                "pay:" + buyerId,
                idempotencyKey,
                PaymentView.class,
                () -> paymentStarter.start(orderGroupId, buyerId));
    }

    /** 订单详情。三层一起返回，买家页一次拿全，不做三次请求。 */
    @GetMapping("/{orderGroupId}")
    public BuyerOrderQuery.OrderDetail buyerOrderDetail(@PathVariable UUID orderGroupId) {
        return queries.detail(orderGroupId, authorizer.current().operatorId());
    }

    /**
     * 我的订单列表。游标分页：{@code nextCursor} 原样传回翻下一页，不传就是第一页；
     * {@code status} 筛展示态（待付款/已付款/已退款…）。走主库，不走搜索索引——
     * 刚下的单在索引里搜不到是经典事故。
     */
    @GetMapping
    public BuyerOrderQuery.OrderPage listBuyerOrders(
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String cursor) {
        int safeLimit = Math.clamp(limit, 1, MAX_PAGE_SIZE);
        return queries.page(authorizer.current().operatorId(), status, cursor, safeLimit);
    }

    public record CancelResult(UUID orderGroupId, boolean cancelled) {}

    private static PlaceOrderRequest toCommand(CreateOrderRequest request, UUID buyerId) {
        return new PlaceOrderRequest(
                buyerId,
                request.quoteId(),
                request.addressId(),
                request.lines().stream()
                        .map(line -> PlaceOrderRequest.Line.of(
                                line.lineNo(), line.skuId(), line.listingId(), line.quantity()))
                        .toList(),
                request.idempotencyKey());
    }
}
