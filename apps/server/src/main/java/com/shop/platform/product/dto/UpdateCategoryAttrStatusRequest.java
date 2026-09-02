package com.shop.platform.product.dto;

import com.shop.platform.product.model.CategoryAttrStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

public record UpdateCategoryAttrStatusRequest(
        @NotNull @Schema(requiredMode = Schema.RequiredMode.REQUIRED) CategoryAttrStatus status) {}
