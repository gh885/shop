package com.shop.platform.fulfillment.controller;

import com.shop.platform.fulfillment.api.FulfillmentCommand;
import com.shop.platform.infra.security.Authorizer;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家侧的包裹入口：看包裹、确认收货。
 *
 * <p><b>归属校验在这里做</b>，链路是「包裹 → 子单 → 订单组 → 买家」。这条链只有 fulfillment 走得通，
 * 因为它知道包裹属于哪个子单。
 *
 * <p>为什么不住在 trade：那样 `trade → fulfillment` 和 `fulfillment → trade` 会同时存在，
 * 模块图上就是一个环。文档里"api 可以双向"这句话挡不住 `modules:check`，
 * 而它是对的——环一旦存在，两个模块就再也分不开了。
 *
 * <p>越权统一返回 404 而不是 403：403 等于告诉对方"这个包裹存在但不是你的"。
 */
@RestController
@RequestMapping("/api/buyer/orders")
public class BuyerShipmentController {

    private final FulfillmentCommand fulfillment;
    private final Authorizer authorizer;

    public BuyerShipmentController(FulfillmentCommand fulfillment, Authorizer authorizer) {
        this.fulfillment = fulfillment;
        this.authorizer = authorizer;
    }

    /**
     * 我的订单发了哪些包裹。
     *
     * @return 不属于当前买家的子单返回 404
     */
    @GetMapping("/seller-orders/{sellerOrderId}/shipments")
    public List<FulfillmentCommand.PackageView> shipments(@PathVariable UUID sellerOrderId) {
        return fulfillment.findBySellerOrderForBuyer(
                sellerOrderId, authorizer.current().operatorId());
    }

    /**
     * 确认收货。按包裹确认——一个商家单可能发多个包裹，每个包单独签收。
     *
     * <p>全部包裹都签收后，订单自动置为"交易完成"并发出 {@code OrderCompleted}。
     *
     * @return {@code confirmed=false} 表示这个包裹已经是终态，什么都没改
     */
    @PostMapping("/packages/{packageId}/receive")
    public ReceiveResult receivePackage(@PathVariable UUID packageId) {
        boolean confirmed = fulfillment.deliver(packageId, authorizer.current().operatorId());
        return new ReceiveResult(packageId, confirmed);
    }

    public record ReceiveResult(UUID packageId, boolean confirmed) {}
}
