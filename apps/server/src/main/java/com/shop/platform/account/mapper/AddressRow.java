package com.shop.platform.account.mapper;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * account.addresses 行投影——买家地址读模型的一行。
 *
 * <p>时间列由数据库管：created_at 靠列默认 now()，updated_at 只在显式 SET 的 SQL 里写；
 * 它们只读不写，进投影不进任何 insert。
 *
 * <p> {@code isDefault} 用 Boolean 包装：record 组件 {@code boolean isDefault} 的访问器也是
 * {@code isDefault()}，没有歧义问题；列本身 NOT NULL，不会真的出现 null。
 */
public record AddressRow(
        UUID id,
        UUID buyerId,
        String receiverName,
        String phone,
        String regionCode,
        String province,
        String city,
        String district,
        String detail,
        String label,
        Boolean isDefault,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {}
