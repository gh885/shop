package com.shop.platform.product.dto;

import com.shop.platform.product.model.CategoryStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

public record UpdateCategoryStatusRequest(
        @NotNull @Schema(requiredMode = Schema.RequiredMode.REQUIRED) CategoryStatus status) {}
