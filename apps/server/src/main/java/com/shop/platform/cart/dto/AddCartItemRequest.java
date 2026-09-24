package com.shop.platform.cart.dto;

import com.shop.platform.common.Quantities;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** 加购入参。同 SKU 重复加购由 service 合并为数量累加（封顶 {@link Quantities#LINE_QUANTITY_MAX}），不是新增行 */
public record AddCartItemRequest(
        @NotNull UUID skuId, @NotNull @Min(1) @Max(Quantities.LINE_QUANTITY_MAX) Integer quantity) {}
