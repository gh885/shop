package com.shop.platform.aftersale.controller;

import com.shop.platform.aftersale.dto.ApplyAfterSaleRequest;
import com.shop.platform.aftersale.dto.ReturnGoodsRequest;
import com.shop.platform.aftersale.mapper.Ticket;
import com.shop.platform.aftersale.service.AfterSaleService;
import com.shop.platform.aftersale.service.TicketView;
import com.shop.platform.common.Validate;
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
 * 买家售后。挂在订单资源下（/orders/{id}/after-sales），全部接口要求登录（不在 JwtAuthFilter skipPaths 内）。
 * 与 orders 共用 OpenAPI tag，前端 SDK 里仍归 OrdersApi。
 */
@Tag(name = "orders", description = "买家订单（全部需登录）")
@RestController
@RequestMapping("/orders/{id}/after-sales")
@RequiredArgsConstructor
public class AfterSaleController {

    private final AfterSaleService afterSaleService;

    /** 申请售后：仅「已完成」且申请窗口未过可发起，返回新建的售后单（带买家视角动作集，C5b） */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TicketView applyAfterSale(
            @CurrentUser UUID userId, @PathVariable UUID id, @Valid @RequestBody ApplyAfterSaleRequest req) {
        Ticket ticket = afterSaleService.apply(userId, id, req.type(), req.reasonCode(), req.reason());
        return TicketView.from(ticket, afterSaleService.buyerActions(ticket));
    }

    /**
     * 最近一张售后单（含终态）：无售后记录 404。买家详情独占地回填两项查询时解析的附加信息——
     * 默认退货地址（AFS-42）与卖家拒绝理由（AFS-44）。
     */
    @GetMapping
    public TicketView getAfterSale(@CurrentUser UUID userId, @PathVariable UUID id) {
        Ticket ticket = Validate.present(afterSaleService.latestForBuyer(userId, id), "暂无售后记录");
        return TicketView.from(ticket, afterSaleService.buyerActions(ticket), afterSaleService.buyerDetail(ticket));
    }

    /** 撤销售后申请：APPLYING → CLOSED */
    @PutMapping("/cancel")
    public void cancelAfterSale(@CurrentUser UUID userId, @PathVariable UUID id) {
        afterSaleService.cancel(userId, id);
    }

    /** 回寄退货并填写物流单：仅退货退款、退货中（RETURNING）可操作，态不变只落物流单号 */
    @PutMapping("/return")
    public void returnGoods(
            @CurrentUser UUID userId, @PathVariable UUID id, @Valid @RequestBody ReturnGoodsRequest req) {
        afterSaleService.returnGoods(userId, id, req.carrierCode(), req.logisticsCompany(), req.trackingNo());
    }
}
