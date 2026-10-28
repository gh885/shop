package com.shop.platform.logistics.controller;

import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.logistics.service.TraceQueryService;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家侧的轨迹时间线。"我的包裹到哪了"。
 *
 * <p><b>两个入口两种凭证。</b>
 *
 * <ul>
 *   <li>按子单查：登录态 + 「包裹 → 子单 → 订单组 → 买家」归属链，别人的子单 404
 *   <li>按包裹号查：{@code package_no} 是随机能力令牌，<b>知道单号即有权查</b>，
 *       不再叠归属列。它仍然要求登录（这个分区整体要求），但不再要求"这个包裹是你的"——
 *       否则同一个包裹在换设备、清缓存后就查不了自己的物流
 * </ul>
 *
 * <p>两个入口都不区分"这个包裹存在但不是你的"：越权一律 404。
 */
@RestController
@RequestMapping("/api/buyer/logistics")
public class BuyerTraceController {

    private final TraceQueryService traces;
    private final Authorizer authorizer;

    public BuyerTraceController(TraceQueryService traces, Authorizer authorizer) {
        this.traces = traces;
        this.authorizer = authorizer;
    }

    /** 某个子单下全部包裹的轨迹。多发几个包就有几条线，前端按包裹分组展示。 */
    @GetMapping("/seller-orders/{sellerOrderId}")
    public List<TraceQueryService.PackageTimeline> buyerOrderTraces(@PathVariable UUID sellerOrderId) {
        return traces.forBuyerOrder(sellerOrderId, authorizer.current().operatorId());
    }

    /** 按包裹号查（能力令牌）。查不到 404。 */
    @GetMapping("/packages/{packageNo}")
    public TraceQueryService.PackageTimeline byPackageNo(@PathVariable String packageNo) {
        return traces.byPackageNo(packageNo);
    }
}
