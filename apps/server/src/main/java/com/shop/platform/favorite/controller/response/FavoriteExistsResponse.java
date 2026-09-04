package com.shop.platform.favorite.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/** 已收藏商品 ID 子集出参 */
public record FavoriteExistsResponse(@Schema(requiredMode = REQUIRED) List<UUID> productIds) {}
