package com.shop.platform.aftersale.controller;

import com.shop.platform.aftersale.dto.RejectAfterSaleRequest;
import com.shop.platform.aftersale.mapper.Ticket;
import com.shop.platform.aftersale.model.TicketAvailableAction;
import com.shop.platform.aftersale.service.AfterSaleService;
import com.shop.platform.aftersale.service.TicketView;
import com.shop.platform.common.Permissions;
import com.shop.platform.common.Validate;
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
 * 卖家售后处理（授权要求 ORDER_FULFILL，与订单作业同权）。shopId 从店铺上下文（X-Shop-Id）取；
 * 越店访问在 service 层按 shop_id 校验，一律 404。与 seller-orders 共用 OpenAPI tag，SDK 里仍归 SellerOrdersApi。
 */
@Tag(name = "seller-orders", description = "卖家订单管理")
@RestController
@RequestMapping("/seller/orders/{id}/after-sales")
@RequiredArgsConstructor
@RequirePermission(Permissions.ORDER_FULFILL)
public class SellerAfterSaleController {

    private final AfterSaleService afterSaleService;

    /** 本店某订单最近一张售后单（含终态）：无售后记录 404；动作集为卖家视角（C5b 下发） */
    @GetMapping
    public TicketView getShopAfterSale(@CurrentShop UUID shopId, @PathVariable UUID id) {
        Ticket ticket = Validate.present(afterSaleService.latestForShop(shopId, id), "暂无售后记录");
        return TicketView.from(
                ticket, TicketAvailableAction.sellerActions(ticket.getStatus(), ticket.isNoReasonEnforced()));
    }

    /** 同意售后：按售后类型分派——仅退款 APPLYING→REFUNDED 一步退；退货退款 APPLYING→RETURNING 进入退货流程 */
    @PutMapping("/agree")
    public void agreeAfterSale(@CurrentShop UUID shopId, @PathVariable UUID id) {
        afterSaleService.agree(shopId, id);
    }

    /**
     * 拒绝售后：APPLYING → REJECTED（申请阶段），RETURNING → REJECTED（退货已寄回、验货不通过）。
     * 理由必填，原样落时间线 note 并随买家详情下发（AFS-30 / AFS-44）。
     */
    @PutMapping("/reject")
    public void rejectAfterSale(
            @CurrentShop UUID shopId, @PathVariable UUID id, @Valid @RequestBody RejectAfterSaleRequest req) {
        afterSaleService.reject(shopId, id, req.reason());
    }

    /** 确认收到退货（仅退货退款、退货中）：RETURNING → REFUNDED，回补库存并退款 */
    @PutMapping("/receive")
    public void receiveReturn(@CurrentShop UUID shopId, @PathVariable UUID id) {
        afterSaleService.receiveReturn(shopId, id);
    }
}
