package com.shop.platform.catalog.dto;

import com.shop.platform.common.money.Money;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 卖家创建商品的入参：一个 SPU + 一组 SKU。
 *
 * <p>只收“事实”，不收状态、ID、审核结果。SPU/SKU 的 ID 由服务端生成，offer 的 shop 归属由提交接口单独给。
 */
public record CreateProductRequest(
        @NotBlank @Size(max = 200) String title,
        @NotNull UUID categoryId,
        UUID brandId,
        @Size(max = 100) String modelNo,
        @NotEmpty @Valid List<SkuRequest> skus,
        @Valid List<AttributeRequest> attributes,
        List<String> images) {

    /**
     * 一条 SKU。
     *
     * @param specs 规格值，key 是 attributeId。必须是类目标了 {@code is_sales_spec} 的属性
     * @param barcode 商品条码（GTIN）。类目声明了 {@code gtin} 时必填——比价和售后认规格都靠它。
     *     没有它而同参数不同商家就区分不开
     */
    public record SkuRequest(
            @NotEmpty Map<UUID, String> specs,
            @NotNull Money price,
            @Positive Integer weightG,
            @Size(max = 64) String barcode) {}

    public record AttributeRequest(@NotNull UUID attributeId, @NotBlank String value) {}
}
