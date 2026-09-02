package com.shop.platform.product.dto;

import com.shop.platform.product.model.SkuStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/** 单个 SKU 的更新项，批量提交。price/stock 必填；其余只 set 非空字段，传 null 不改 */
public record SkuUpdateItem(
        @NotNull UUID skuId,
        @Size(max = 160) String name,
        @Size(max = 255) String image,
        @NotNull @Min(0) Long price,
        @Min(0) Long originalPrice,
        @NotNull @Min(0) Integer stock,
        /** 业务编码（仓管/ERP 对账用），全局唯一；传 null 不改，重复会 409 */
        @Size(max = 64) String skuCode,
        /** 在售 / 停用；传 null 不改 */
        @Schema SkuStatus status) {}
