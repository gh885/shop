package com.shop.platform.order.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.order.mapper.OrderItem;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

/**
 * 订单行项目出参：快照字段原样透出，amount 供详情页小计展示（买家/卖家详情共用）。
 *
 * <p>{@code orderItemId} 是订单行自己的主键：凡是「按行引用这单里的某一行」的动作都要用它
 * （评价逐行打分 REV-02、退货按行定位），出参不带它，前端就只能拿 skuId 猜——而行与 SKU 不是一回事
 * （同一 SKU 买两件是两个行）。
 */
@Schema(name = "OrderItemResponse")
public record OrderItemView(
        @Schema(requiredMode = REQUIRED) UUID orderItemId,
        @Schema(requiredMode = REQUIRED) UUID productId,
        @Schema(requiredMode = REQUIRED) UUID skuId,
        @Schema(requiredMode = REQUIRED) String name,
        @Schema(requiredMode = REQUIRED, nullable = true) String image,
        @Schema(requiredMode = REQUIRED) Money price,
        @Schema(requiredMode = REQUIRED, nullable = true) Money originalPrice,
        @Schema(requiredMode = REQUIRED) Integer quantity,
        @Schema(requiredMode = REQUIRED) Money amount) {

    public static OrderItemView from(OrderItem i) {
        return new OrderItemView(
                i.getId(),
                i.getProductId(),
                i.getSkuId(),
                i.getName(),
                i.getImage(),
                i.priceAsMoney(),
                i.originalPriceAsMoney(),
                i.getQuantity(),
                i.amountAsMoney());
    }
}
