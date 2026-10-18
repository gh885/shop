package com.shop.platform.aftersale.controller;

import com.shop.platform.aftersale.dto.RejectRefundRequest;
import com.shop.platform.aftersale.service.RefundService;
import com.shop.platform.aftersale.service.RefundView;
import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentShop;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家退款处理（授权要求 ORDER_FULFILL，与订单作业同权）。shopId 从店铺上下文（X-Shop-Id）取；
 * 越店访问在 service 层按 shop_id 校验，一律 404。与 seller-orders 共用 OpenAPI tag，SDK 里仍归 SellerOrdersApi。
 */
@Tag(name = "seller-orders", description = "卖家订单管理")
@RestController
@RequestMapping("/seller/orders/{id}/refunds")
@RequiredArgsConstructor
@RequirePermission(Permissions.ORDER_FULFILL)
public class SellerRefundController {

    private final RefundService refundService;

    /** 本店某订单最近一张退款单（优先进行中，含终态）：无记录 404；动作集为卖家视角 */
    @GetMapping
    public RefundView getShopRefund(@CurrentShop UUID shopId, @PathVariable UUID id) {
        return refundService.sellerDetailView(shopId, id);
    }

    /** 同意退款：仅退款/补偿直接发起退款；退货退款进入待寄回 */
    @PutMapping("/agree")
    public void agreeRefund(@CurrentShop UUID shopId, @PathVariable UUID id) {
        refundService.agree(shopId, id);
    }

    /** 拒绝退款：仅待处理可拒，理由必填；七天无理由强制单不给这条边 */
    @PutMapping("/reject")
    public void rejectRefund(
            @CurrentShop UUID shopId, @PathVariable UUID id, @Valid @RequestBody RejectRefundRequest req) {
        refundService.reject(shopId, id, req.reason());
    }

    /** 确认收到退货：已寄回 → 卖家已收货 → 退款并回补库存 */
    @PutMapping("/receive")
    public void receiveReturn(@CurrentShop UUID shopId, @PathVariable UUID id) {
        refundService.receiveReturn(shopId, id);
    }

    /** 确认拦截成功：已寄回 → 已撤销（货不退回，钱也不出） */
    @PutMapping("/intercept")
    public void interceptReturn(@CurrentShop UUID shopId, @PathVariable UUID id) {
        refundService.intercept(shopId, id);
    }

    /** 人工重试：自动重试耗尽后的出口（失败 → 退款中） */
    @PutMapping("/retry")
    public void retryRefund(@CurrentShop UUID shopId, @PathVariable UUID id) {
        refundService.retry(shopId, id);
    }
}
