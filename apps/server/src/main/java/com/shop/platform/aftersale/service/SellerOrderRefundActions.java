package com.shop.platform.aftersale.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.aftersale.model.RefundAvailableAction;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/**
 * 一张订单上的卖家退款动作（卖家订单列表行内按钮）：按本页 orderId 批查，动作与工作台同源。
 *
 * <p>{@code order.afterSaleBadge} 只是展示投影，不拿来推导按钮——按钮由退款单状态机算出。
 * 没有进行中退款单的订单不出现在结果里（前端取不到 = 无动作）。
 */
@Schema(name = "SellerOrderRefundActionsResponse")
public record SellerOrderRefundActions(
        @Schema(requiredMode = REQUIRED) UUID orderId,
        @Schema(requiredMode = REQUIRED) List<RefundAvailableAction> availableActions) {}
