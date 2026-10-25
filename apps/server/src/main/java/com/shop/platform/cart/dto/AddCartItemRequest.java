package com.shop.platform.cart.dto;

import com.shop.platform.common.CartRules;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** 加购入参：同 SKU 幂等合并为数量累加，quantity 是本次想加的件数 */
public record AddCartItemRequest(
        @NotNull UUID skuId, @NotNull @Min(1) @Max(CartRules.LINE_QUANTITY_MAX) Integer quantity) {}
