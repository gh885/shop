package com.shop.platform.catalog.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/** 商家给某个规格值配一张默认图。 */
@Schema(name = "ProductSpecImageRequest")
public record SpecImageRequest(
        @NotNull UUID attributeId,
        @NotBlank @Size(max = 64) String value,
        @NotBlank @Size(max = 1024) String imageUrl) {}
