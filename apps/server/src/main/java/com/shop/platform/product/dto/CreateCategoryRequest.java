package com.shop.platform.product.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record CreateCategoryRequest(
        UUID parentId,
        @NotBlank @Size(max = CategoryFieldRules.NAME_MAX) String name,
        Integer sort,
        @Size(max = CategoryFieldRules.ICON_MAX) String iconUrl) {
    public CreateCategoryRequest {
        if (name != null) name = name.trim();
    }
}
