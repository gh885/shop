package com.shop.platform.catalog.dto;

import com.shop.platform.common.money.Money;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 卖家侧的商品详情：**任何状态都能看**，包括草稿、审核中、已下架。
 *
 * <p>与买家侧的 {@link ProductDetail} 分开两个类型，不是重复——两边的口径不同：
 *
 * <ul>
 *   <li>买家只看得见 {@code online} 商品的 {@code active} SKU；卖家要看得见全部 SKU（含停售的），
 *       否则「我明明建了 5 个规格，怎么只显示 3 个」无从排查
 *   <li>买家侧只给 {@code minPrice}；卖家要给每个 SKU 的价，他才是定价的人
 *   <li>卖家需要 {@code listing} 状态和驳回理由——那是他唯一能看见的反馈
 * </ul>
 *
 * <p>共用一个类型，就只能要么给买家多余的字段（含驳回理由，泄露内部审核话术），
 * 要么给卖家缺失的字段（看不见自己停售的 SKU）。
 *
 * @param listingStatus 还没提交过挂售时为 null
 * @param rejectReason 最近一次驳回的理由；没被驳回过为 null
 */
public record SellerProductDetail(
        UUID spuId,
        String title,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String subtitle,
        UUID categoryId,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) UUID brandId,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String modelNo,
        boolean sevenDayReturn,
        long soldCount,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) List<String> images,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) List<String> detailImages,
        List<AttributeView> attributes,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) List<SpecImageView> specImages,
        List<SkuView> skus,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) UUID listingId,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String listingStatus,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String rejectReason) {

    public record AttributeView(UUID attributeId, String code, String name, String value) {}

    /**
     * 卖家看自己的 SKU：带 id（改价要按它定位）和状态（停售的要能看见）。
     *
     * @param merchantCode 商家自己的货号；买家侧不返回
     */
    public record SkuView(
            UUID skuId,
            String name,
            Map<String, String> specs,
            Money price,
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) Money originalPrice,
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) Integer weightG,
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String barcode,
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String merchantCode,
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String imageUrl,
            String status) {}
}
