package com.shop.platform.favorite.dto;

import com.shop.platform.common.Quantities;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 批量收藏状态查询入参：详情页/列表页传候选商品 ID 集合。
 *
 * <p>上限 {@link Quantities#BATCH_IDS_MAX} 与售后那条批量点查同一档：这个入口问的就是「刚取到的那一页」
 * 收藏没收藏，比一页更宽的请求不是它的用法（拿它当导出接口刷全店商品）。此前只有 {@code @NotEmpty}，条数无界。
 */
public record FavoriteExistsRequest(@NotEmpty @Size(max = Quantities.BATCH_IDS_MAX) List<UUID> productIds) {}
