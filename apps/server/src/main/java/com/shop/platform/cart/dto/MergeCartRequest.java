package com.shop.platform.cart.dto;

import com.shop.platform.common.CartRules;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 游标车并入入参：登录成功后前端把 localStorage 里的车一次性搬上来。
 * 逐条 upsert，不做在售闸门——失效商品照收进车、列表页置灰；
 * 行数上限与车内种类上限同值（种类闸门在 service，这里只挡明显失控的请求）。
 */
public record MergeCartRequest(@NotEmpty @Size(max = CartRules.ITEM_KINDS_MAX) @Valid List<MergeLine> items) {

    public record MergeLine(@NotNull UUID skuId, @NotNull @Min(1) @Max(CartRules.LINE_QUANTITY_MAX) Integer quantity) {}
}
