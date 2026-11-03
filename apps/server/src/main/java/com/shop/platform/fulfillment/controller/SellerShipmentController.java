package com.shop.platform.fulfillment.controller;

import com.shop.platform.fulfillment.api.FulfillmentCommand;
import com.shop.platform.fulfillment.dto.ShipRequest;
import com.shop.platform.infra.security.AccessScope;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家发货入口。
 *
 * <p>三道闸门，缺一不可：
 *
 * <ul>
 *   <li>{@code PACKAGE_SHIP} / {@code PACKAGE_READ} 权限点——有没有资格碰这一侧的包裹
 *   <li>子单归属与店铺范围——随 {@code AccessScope.Seller} 凭据进 service：功能权限对了但忘了归属，
 *       客服就能给别家的单发货；子账号只有授权店的发货权
 * </ul>
 */
@RestController
@RequestMapping("/api/seller/orders")
public class SellerShipmentController {

    private final FulfillmentCommand fulfillment;
    private final Authorizer authorizer;

    public SellerShipmentController(FulfillmentCommand fulfillment, Authorizer authorizer) {
        this.fulfillment = fulfillment;
        this.authorizer = authorizer;
    }

    /**
     * 发货。可以分多次发，每次一个包裹。
     *
     * <p>数量上限由 trade 算（{@code quantity - shipped_qty}），前端传的数字只是"这次发几件"，
     * 传大了会被拒——超发就是超卖。
     */
    @PostMapping("/{sellerOrderId}/shipments")
    public FulfillmentCommand.ShippedPackage ship(
            @PathVariable UUID sellerOrderId, @Valid @RequestBody ShipRequest request) {
        AccessScope.Seller scope = authorizer.seller(Permission.PACKAGE_SHIP);

        return fulfillment.ship(new FulfillmentCommand.ShipRequest(
                sellerOrderId,
                scope,
                request.carrierCode(),
                request.trackingNo(),
                request.items().stream()
                        .map(item -> new FulfillmentCommand.ShipItem(item.lineNo(), item.quantity()))
                        .toList()));
    }

    /** 这个子单下已发的全部包裹。商家后台看"我发了几个包、单号是什么"。归属在 SQL 里，别人的子单查出空。 */
    @GetMapping("/{sellerOrderId}/shipments")
    public List<FulfillmentCommand.PackageView> listShipments(@PathVariable UUID sellerOrderId) {
        AccessScope.Seller scope = authorizer.seller(Permission.PACKAGE_READ);
        return fulfillment.findBySellerOrder(sellerOrderId, scope);
    }
}
