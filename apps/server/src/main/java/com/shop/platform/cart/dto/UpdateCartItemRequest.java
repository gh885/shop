package com.shop.platform.cart.dto;

import com.shop.platform.common.CartRules;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** 改数量入参：设为终值（不是增量）。数量归 0 不在此表达——删除走 DELETE，两种语义不混 */
public record UpdateCartItemRequest(@NotNull @Min(1) @Max(CartRules.LINE_QUANTITY_MAX) Integer quantity) {}
