package com.shop.platform.cart.mapper;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * cart.items 行投影——购物车条目的一行。
 *
 * <p>时间列由数据库管：created_at 靠列默认 now()（也是「新加的在前」的排序键），
 * updated_at 只在显式 SET 的 SQL 里写；它们只读不写，进投影不进任何 insert。
 */
public record CartItemRow(
        UUID id,
        UUID buyerId,
        UUID skuId,
        int quantity,
        boolean selected,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {}
