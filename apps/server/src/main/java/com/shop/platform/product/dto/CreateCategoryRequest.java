package com.shop.platform.product.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record CreateCategoryRequest(
        UUID parentId, @NotBlank @Size(max = 64) String name, Integer sort, @Size(max = 255) String iconUrl) {
    public CreateCategoryRequest {
        if (name != null) name = name.trim();
    }
}
