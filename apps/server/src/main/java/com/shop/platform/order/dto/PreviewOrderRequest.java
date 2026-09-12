package com.shop.platform.order.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 结算预览入参：与 CreateOrderRequest 同构但地址可选——
 * addressId 缺省返回 null 地址块（前端持有地址列表自行默认勾选），结算行不可为空。
 *
 * <p>userCouponIds 是买家选中的券（可空 = 不用券）。带它是因为预览必须按「当前选择」算钱：
 * 换一张券就要重算一次，不能只在真正下单时才算——那正是「预览价 ≠ 实付价」的来源。
 */
public record PreviewOrderRequest(
        UUID addressId,
        @NotEmpty List<@Valid OrderLineRequest> lines,
        @Size(max = 20, message = "一次结算最多选择 20 张优惠券") List<UUID> userCouponIds) {}
