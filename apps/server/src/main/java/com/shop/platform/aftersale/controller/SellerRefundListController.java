package com.shop.platform.aftersale.controller;

import com.shop.platform.aftersale.service.RefundService;
import com.shop.platform.aftersale.service.SellerOrderRefundActions;
import com.shop.platform.aftersale.service.SellerRefundItem;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Permissions;
import com.shop.platform.common.Quantities;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentShop;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家退款工作台（授权要求 ORDER_FULFILL，与订单作业同权）：按店分页列出退款单。
 *
 * <p>与 {@link SellerRefundController} 的分工：那个挂在订单资源下（/seller/orders/{id}/refunds），
 * 处理「这一单的退款」；这个在店铺资源下（/seller/refunds），回答「本店有哪些退款待办」。
 * 归属由 shopId 上下文（X-Shop-Id，成员过滤器校验）圈定，越店数据不参与查询。
 */
@Tag(name = "seller-refunds", description = "卖家退款工作台")
@RestController
@RequestMapping("/seller/refunds")
@Validated
@RequiredArgsConstructor
@RequirePermission(Permissions.ORDER_FULFILL)
public class SellerRefundListController {

    private final RefundService refundService;

    /** 本店退款单分页：status 筛选（待处理 / 待寄回 / 已寄回 / 退款中 / 终态…），空 = 全部，时间倒序 */
    @GetMapping
    public PageResult<SellerRefundItem> listShopRefunds(
            @CurrentShop UUID shopId, @Valid PageParams pageParams, @RequestParam(required = false) String status) {
        return refundService.pageShop(shopId, status, pageParams);
    }

    /**
     * 一页订单的卖家退款动作（卖家订单列表行内按钮）：按本页 orderId 批查，动作集与工作台同源。
     *
     * <p>为什么不并进 {@code GET /seller/orders} 的行：动作由退款单状态机算出，而订单模块是本模块的下游
     * （依赖方向 aftersale → order :: api），让订单列表反向带上退款动作会成环。前端两次请求换模块边界干净。
     * 参数按 {@code List} 收：重复参数与单个逗号分隔值都能绑成列表，SDK 的数组序列化怎么选都不挑。
     */
    @GetMapping("/actions")
    public List<SellerOrderRefundActions> listRefundActionsByOrders(
            @CurrentShop UUID shopId, @RequestParam @Size(max = Quantities.BATCH_IDS_MAX) List<UUID> orderIds) {
        return refundService.sellerActionsByOrders(shopId, orderIds);
    }
}
