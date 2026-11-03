package com.shop.platform.logistics.controller;

import com.shop.platform.infra.security.AccessScope;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.logistics.service.TraceQueryService;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家侧的轨迹时间线。"我这个包走到哪了"。
 *
 * <p>归属两层，都在 fulfillment 的 SQL 里：{@code merchant_id} 从令牌取，
 * {@code shopIds} 再收窄到操作人被授权的店。轨迹本身不做归属判断——
 * 它按包裹 id 存，包裹已经过归属链。
 */
@RestController
@RequestMapping("/api/seller/logistics")
public class SellerTraceController {

    private final TraceQueryService traces;
    private final Authorizer authorizer;

    public SellerTraceController(TraceQueryService traces, Authorizer authorizer) {
        this.traces = traces;
        this.authorizer = authorizer;
    }

    /** 某个子单下全部包裹的轨迹。别人的子单查出空列表（归属列直写在 SQL 里）。 */
    @GetMapping("/seller-orders/{sellerOrderId}")
    public List<TraceQueryService.PackageTimeline> sellerOrderTraces(@PathVariable UUID sellerOrderId) {
        // 看轨迹与看包裹是同一件事的两面（同一个资源 package），所以共用一个码
        AccessScope.Seller scope = authorizer.seller(Permission.PACKAGE_READ);
        return traces.forSellerOrder(sellerOrderId, scope);
    }
}
