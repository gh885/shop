package com.shop.platform.favorite.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** 收藏入参：SPU 级，重复收藏幂等（返回原行不报错） */
public record AddFavoriteRequest(@NotNull UUID productId) {}
