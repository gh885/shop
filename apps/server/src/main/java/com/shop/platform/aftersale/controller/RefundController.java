package com.shop.platform.aftersale.controller;

import com.shop.platform.aftersale.dto.ApplyRefundRequest;
import com.shop.platform.aftersale.dto.ReturnGoodsRequest;
import com.shop.platform.aftersale.service.RefundService;
import com.shop.platform.aftersale.service.RefundView;
import com.shop.platform.infra.web.CurrentUser;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
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
 * 买家退款。挂在订单资源下（/orders/{id}/refunds），全部接口要求登录（不在 JwtAuthFilter skipPaths 内）。
 * 与 orders 共用 OpenAPI tag，前端 SDK 里仍归 OrdersApi。
 */
@Tag(name = "orders", description = "买家订单（全部需登录）")
@RestController
@RequestMapping("/orders/{id}/refunds")
@RequiredArgsConstructor
public class RefundController {

    private final RefundService refundService;

    /** 申请退款：逐行给数量，金额服务端算（AFS-12 / §6.2） */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RefundView applyRefund(
            @CurrentUser UUID userId, @PathVariable UUID id, @Valid @RequestBody ApplyRefundRequest req) {
        return refundService.apply(userId, id, req.type(), req.reasonCode(), req.reason(), req.lines());
    }

    /**
     * 最近一张退款单（优先进行中，含终态）：无退款记录 404。
     * 买家详情独占地回填默认退货地址（AFS-42）。
     */
    @GetMapping
    public RefundView getRefund(@CurrentUser UUID userId, @PathVariable UUID id) {
        return refundService.buyerDetailView(userId, id);
    }

    /** 撤销退款：待处理 / 待寄回可撤 */
    @PutMapping("/cancel")
    public void cancelRefund(@CurrentUser UUID userId, @PathVariable UUID id) {
        refundService.cancel(userId, id);
    }

    /** 回寄退货并填写物流单：仅退货退款、待寄回可操作，可重复提交覆盖运单号 */
    @PutMapping("/return")
    public void returnGoods(
            @CurrentUser UUID userId, @PathVariable UUID id, @Valid @RequestBody ReturnGoodsRequest req) {
        refundService.returnGoods(userId, id, req.carrierCode(), req.logisticsCompany(), req.trackingNo());
    }
}
