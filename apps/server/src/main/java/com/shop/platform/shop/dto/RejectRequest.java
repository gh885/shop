package com.shop.platform.shop.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 入驻审核驳回：备注落 {@code shop.shop_reviews.reason}，上限为什么不是别处的 200 见 {@link ShopFieldRules#REVIEW_REASON_MAX}。 */
public record RejectRequest(@NotBlank @Size(max = ShopFieldRules.REVIEW_REASON_MAX) String reason) {}
