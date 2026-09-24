package com.shop.platform.shop.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateShopRequest(
        @NotBlank @Size(max = ShopFieldRules.NAME_MAX) String name,
        @Size(max = ShopFieldRules.LOGO_KEY_MAX) String logoKey) {
    public CreateShopRequest {
        if (name != null) name = name.trim();
    }
}
