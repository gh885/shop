package com.shop.platform.catalog.dto;

import com.shop.platform.common.money.Money;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

/**
 * 买家商品卡片。列表 / feed / 搜索共用一张卡，字段只够画它。
 *
 * <p>比卖家侧 {@code SellerProductItem} 少的东西（库存、SKU 数、审核状态）不是漏了：
 * 买家不关心这些，给了只是每页多拉几十 KB，还要担心"内部审核话术"顺着列表漏出去。
 *
 * @param imageUrl 主图（spu_media 第一条通用图）；没有图为 null
 * @param minPrice 起价（可售且有库存的 active SKU 最低价；全都没货时回退全部 active SKU 最低价）
 *     null = 暂时没有报价（有 listing 但 SKU 全停用）
 * @param shopId 挂售店铺之一；同一商品可能挂多家店，卡片只展示一个入口
 */
public record BuyerProductCard(
        UUID spuId,
        String title,
        String subtitle,
        UUID categoryId,
        @Schema(nullable = true) String imageUrl,
        @Schema(nullable = true) Money minPrice,
        @Schema(nullable = true) UUID shopId,
        long soldCount,
        boolean sevenDayReturn,
        Instant createdAt) {}
