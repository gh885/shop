package com.shop.platform.aftersale.controller;

import com.shop.platform.aftersale.service.AfterSaleService;
import com.shop.platform.aftersale.service.SellerTicketItem;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentShop;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家售后工作台（授权要求 ORDER_FULFILL，与订单作业同权）：按店分页列出售后单。
 *
 * <p>与 {@link SellerAfterSaleController} 的分工：那个挂在订单资源下（/seller/orders/{id}/after-sales），
 * 处理「这一单的售后」；这个在店铺资源下（/seller/after-sales），回答「本店有哪些售后待办」。
 * 归属由 shopId 上下文（X-Shop-Id，成员过滤器校验）圈定，越店数据不参与查询。
 */
@Tag(name = "seller-after-sales", description = "卖家售后工作台")
@RestController
@RequestMapping("/seller/after-sales")
@Validated
@RequiredArgsConstructor
@RequirePermission(Permissions.ORDER_FULFILL)
public class SellerAfterSaleListController {

    private final AfterSaleService afterSaleService;

    /** 本店售后单分页：status 筛选（APPLYING 待处理 / RETURNING 退货中 / 终态…），空 = 全部，时间倒序 */
    @GetMapping
    public PageResult<SellerTicketItem> listShopAfterSales(
            @CurrentShop UUID shopId, @Valid PageParams pageParams, @RequestParam(required = false) String status) {
        return afterSaleService.pageShop(shopId, status, pageParams);
    }
}
