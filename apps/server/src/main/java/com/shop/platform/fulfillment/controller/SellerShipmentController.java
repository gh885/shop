package com.shop.platform.fulfillment.controller;

import com.shop.platform.fulfillment.api.FulfillmentCommand;
import com.shop.platform.fulfillment.dto.ShipRequest;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
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
 * <p>两道闸门，缺一不可：
 *
 * <ul>
 *   <li>{@code ORDER_READ} 权限点——有没有资格碰订单
 *   <li>子单归属——service 里比对 {@code merchantId}。功能权限对了但忘了归属，
 *       客服就能给别家的单发货
 * </ul>
 *
 * <p>不校验 {@code shopId} 数据范围：发货的粒度是子单，而子单带着 {@code merchantId}，
 * service 直接用商家归属判。再叠一层店铺范围等于同一个判断写两遍，两遍迟早不一致。
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
        authorizer.check(Permission.ORDER_READ);

        return fulfillment.ship(new FulfillmentCommand.ShipRequest(
                sellerOrderId,
                requireMerchantId(),
                request.carrierCode(),
                request.trackingNo(),
                request.items().stream()
                        .map(item -> new FulfillmentCommand.ShipItem(item.lineNo(), item.quantity()))
                        .toList()));
    }

    /** 这个子单下已发的全部包裹。商家后台看"我发了几个包、单号是什么"。归属在 SQL 里，别人的子单查出空。 */
    @GetMapping("/{sellerOrderId}/shipments")
    public List<FulfillmentCommand.PackageView> list(@PathVariable UUID sellerOrderId) {
        authorizer.check(Permission.ORDER_READ);
        return fulfillment.findBySellerOrder(sellerOrderId, requireMerchantId());
    }

    /** 商家归属只从令牌来。买家/员工误入这个卖家接口，当场 403。 */
    private UUID requireMerchantId() {
        CurrentOperator operator = authorizer.current();
        if (!CurrentOperator.TYPE_SELLER.equals(operator.operatorType()) || operator.merchantId() == null) {
            throw com.shop.platform.common.BusinessException.forbidden("SELLER_ONLY", "只有卖家可以操作发货");
        }
        return operator.merchantId();
    }
}
