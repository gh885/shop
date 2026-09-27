package com.shop.platform.shop.dto;

import jakarta.validation.constraints.Size;

/** 管理端店铺列表筛选（GET /admin/shops）：状态档位与关键字（店名或店主 ID），都可空。 */
public record AdminShopQuery(String status, @Size(max = ShopFieldRules.NAME_MAX) String keyword) {}
