package com.shop.platform.catalog.dto;

import com.shop.platform.catalog.model.ListingStatus;
import java.util.UUID;

/** 卖家提交 listing 后的结果：审核状态和 listing id。 */
public record ListingResult(UUID listingId, ListingStatus status) {}
