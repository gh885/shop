package com.shop.platform.shop.service;

import com.shop.platform.shop.model.ShopReviewStatus;
import java.time.OffsetDateTime;
import java.util.UUID;

public record ShopReviewItem(
        UUID id,
        UUID shopId,
        String shopName,
        String ownerPhone,
        ShopReviewStatus status,
        String reason,
        OffsetDateTime decidedAt,
        OffsetDateTime createdAt) {}
