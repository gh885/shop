package com.shop.platform.product.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateCategoryRequest(
        @NotBlank @Size(max = 64) String name, Integer sort, @Size(max = 255) String iconUrl) {
    public UpdateCategoryRequest {
        if (name != null) name = name.trim();
    }
}
