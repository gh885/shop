package com.shop.platform.favorite.dto;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.UUID;

/** 批量收藏状态查询入参：详情页/列表页传候选商品 ID 集合 */
public record FavoriteExistsRequest(@NotEmpty List<UUID> productIds) {}
