package com.shop.platform.order.dto;

import com.shop.platform.common.Quantities;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 结算预览入参：与 CreateOrderRequest 同构但地址可选——
 * addressId 缺省返回 null 地址块（前端持有地址列表自行默认勾选），结算行不可为空。
 *
 * <p>userCouponIds 是买家选中的券（可空 = 不用券）。带它是因为预览必须按「当前选择」算钱：
 * 换一张券就要重算一次，不能只在真正下单时才算——那正是「预览价 ≠ 实付价」的来源。
 *
 * <p>行数区间与 CreateOrderRequest 刻意同值同写法（{@code @NotNull} 管必填、{@code @Size} 管 1~99）：
 * 预览与创建走同一条解析路径，闸门不同步就等于给脚本留了个免费的探测口。
 */
public record PreviewOrderRequest(
        UUID addressId,
        @NotNull @Size(min = 1, max = Quantities.ORDER_LINES_MAX, message = "结算条目需 1 到 99 行")
                List<@Valid OrderLineRequest> lines,
        @Size(max = Quantities.COUPONS_PER_CHECKOUT_MAX, message = "一次结算最多选择 20 张优惠券") List<UUID> userCouponIds) {}
