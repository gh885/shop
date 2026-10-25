package com.shop.platform.cart.dto;

import com.shop.platform.common.CartRules;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/** 批量删入参：下单后清勾选、清置灰共用。上限即车内种类上限——要删的不可能比车里的还多 */
public record BatchDeleteRequest(@NotEmpty @Size(max = CartRules.ITEM_KINDS_MAX) List<UUID> skuIds) {}
