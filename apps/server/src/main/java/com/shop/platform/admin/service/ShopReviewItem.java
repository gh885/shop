package com.shop.platform.admin.service;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ShopReviewItem(
        UUID id,
        UUID shopId,
        String shopName,
        String ownerPhone,
        String status,
        String reason,
        OffsetDateTime decidedAt,
        OffsetDateTime createdAt) {}
