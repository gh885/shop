package com.shop.platform.catalog.dto;

import com.shop.platform.catalog.model.OfferStatus;
import java.util.UUID;

/** 卖家提交 offer 后的结果：审核状态和 offer id。 */
public record OfferResult(UUID offerId, OfferStatus status) {}
