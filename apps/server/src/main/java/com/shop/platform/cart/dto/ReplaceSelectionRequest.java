package com.shop.platform.cart.dto;

import com.shop.platform.common.CartRules;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 勾选集合重设入参：声明式——「当前勾选集合就是这批 skuId」。
 * 全选传整车、按店选传那家店的 skuIds、单选传一条，服务端不区分场景。
 * 上限即车内种类上限——勾选集合是车的子集，天然不可能超过它。
 */
public record ReplaceSelectionRequest(@NotNull @Size(max = CartRules.ITEM_KINDS_MAX) List<UUID> skuIds) {}
