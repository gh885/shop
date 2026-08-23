package com.shop.platform.cart.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/** 修改购物车条目入参：数量/勾选二选一或同传，null 字段保持原值；条目 ID 走路径参数 */
public record UpdateCartItemRequest(@Min(1) @Max(999) Integer quantity, Boolean selected) {}
