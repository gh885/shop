package com.shop.platform.shop.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateShopRequest(@NotBlank @Size(max = 50) String name, @Size(max = 255) String logoKey) {
    public CreateShopRequest {
        if (name != null) name = name.trim();
    }
}
