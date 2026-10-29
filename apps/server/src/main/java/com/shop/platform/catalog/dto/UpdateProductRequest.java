package com.shop.platform.catalog.dto;

import com.shop.platform.common.money.Money;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 改商品基本信息（规格与 SKU 之外的字段）。
 *
 * <p><b>没有 {@code categoryId}。</b> 类目不可改——换了类目等于换了一套属性模板与值域，
 * 旧的 {@code spu_attr} 行是按旧模板的类型落的库（数字进了 {@code value_num}、枚举进了
 * {@code value_text}），改类目后它们全部对不上，而没有任何迁移能猜出「旧的『材质=棉』
 * 在新类目里对应哪个属性」。要换类目就删了重建。
 *
 * <p><b>没有 {@code status}。</b> 上架状态不是「基本信息」，它有独立入口与独立权限语义：
 * 改标题是编辑，上架是发布。合成一个接口，等于让「改个错别字」也能顺手把商品上架。
 */
public record UpdateProductRequest(
        @NotBlank @Size(max = 200) String title,
        @Size(max = 200) String subtitle,
        UUID brandId,
        @Size(max = 100) String modelNo,
        Boolean sevenDayReturn,
        @Valid List<AttributeRequest> attributes,
        List<String> images,
        @Size(max = 30) List<@Size(max = 1024) String> detailImages,
        @Valid List<SpecImageRequest> specImages) {

    /** 属性值。语义与创建时一致：id 必须属于这个类目，必填项不能缺。 */
    public record AttributeRequest(@NotNull UUID attributeId, @NotBlank String value) {}

    /**
     * 改一条 SKU。<b>没有 {@code specs}。</b>
     *
     * <p>规格决定 {@code spec_key} 与 {@code identity_key}，后者是比价和售后认规格的依据。
     * 改规格等于把这个 SKU 变成另一个商品，而历史订单里那条 sku_id 还指着它——
     * 买「红/L」的人会变成买「蓝/M」。要换规格就停售旧的、建新的。
     *
     * @param status {@code active} / {@code disabled}；null = 不改。
     *     停售是「删除」的替代品：{@code trade.order_line} 存着 sku_id，删行会断掉历史订单的规格身份
     * @param originalPrice null = 清空划线价
     * @param merchantCode null = 清空商家货号
     */
    public record SkuRequest(
            @NotNull UUID skuId,
            @NotNull Money price,
            @Positive Integer weightG,
            @Size(max = 16) String status,
            Money originalPrice,
            @Size(max = 64) String merchantCode) {}
}
