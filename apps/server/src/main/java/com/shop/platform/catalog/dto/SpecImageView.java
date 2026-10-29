package com.shop.platform.catalog.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

/**
 * 规格值图：选「红」就换这张。
 *
 * <p>挂在 SPU 的 {@code (attribute_id, spec_value)} 上，不是挂在 SKU 上——8 色 × 5 码 = 40 个 SKU，
 * 图只有 8 套。放在 SKU 上会让同一颜色的 5 个尺码各存一份，改图要改五处。
 */
@Schema(name = "ProductSpecImageView")
public record SpecImageView(UUID attributeId, String value, String imageUrl) {}
