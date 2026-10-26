package com.shop.platform.cart.dto;

import com.shop.platform.common.FavoriteRules;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 批量查「这些商品我收藏了吗」。
 *
 * <p>上限在 {@code @Size} 上，service 不重复判——两处判断迟早会漂。
 * 200 是「一屏商品卡片不可能超过它」的量级，也是 {@code foreach IN} 子句有界的保证。
 */
public record FavoriteExistsRequest(@NotNull @Size(min = 1, max = FavoriteRules.EXISTS_BATCH_MAX) List<UUID> spuIds) {}
