package com.shop.platform.catalog.dto;

import com.shop.platform.common.money.Money;
import io.swagger.v3.oas.annotations.media.Schema;
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
 * <p>只收“事实”，不收状态、ID、审核结果。SPU/SKU 的 ID 由服务端生成，listing 的 shop 归属由提交接口单独给。
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
     * <p>{@code name} 显式起名不是装饰：{@link UpdateProductRequest.SkuRequest} 与本 record 的简单名都是
     * {@code SkuRequest}，springdoc 按 schema 名去重，后注册的把先注册的整个顶掉——创建侧的
     * {@code specs}/{@code barcode} 会从契约里消失，SDK 生成出「创建商品发不出规格」的假契约。
     *
     * @param specs 规格值，key 是 attributeId。必须是类目标了 {@code is_sales_spec} 的属性
     * @param barcode 商品条码（GTIN）。类目声明了 {@code gtin} 时必填——比价和售后认规格都靠它。
     *     没有它而同参数不同商家就区分不开
     */
    @Schema(name = "CreateProductSkuRequest")
    public record SkuRequest(
            @NotEmpty Map<UUID, String> specs,
            @NotNull Money price,
            @Positive Integer weightG,
            @Size(max = 64) String barcode) {}

    /** 属性值。与 {@link UpdateProductRequest.AttributeRequest} 同形状，schema 名撞了也无所谓——内容一致。 */
    public record AttributeRequest(@NotNull UUID attributeId, @NotBlank String value) {}
}
