package com.shop.platform.order.dto;

import com.shop.platform.common.Quantities;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/**
 * 结算/下单的一行：SKU + 件数。购物车勾选与立即购买在前端归约成同一形状，
 * order 不区分来源、不回查购物车；件数上限与加购、cart.items 的 CHECK 同一档（{@link Quantities#LINE_QUANTITY_MAX}）。
 */
public record OrderLineRequest(
        @NotNull UUID skuId, @NotNull @Min(1) @Max(Quantities.LINE_QUANTITY_MAX) Integer quantity) {}
