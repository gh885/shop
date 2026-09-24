package com.shop.platform.product.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateCategoryRequest(
        @NotBlank @Size(max = CategoryFieldRules.NAME_MAX) String name,
        Integer sort,
        @Size(max = CategoryFieldRules.ICON_MAX) String iconUrl) {
    public UpdateCategoryRequest {
        if (name != null) name = name.trim();
    }
}
