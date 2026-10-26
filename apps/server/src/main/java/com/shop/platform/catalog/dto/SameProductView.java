package com.shop.platform.catalog.dto;

import com.shop.platform.common.money.Money;
import java.util.List;
import java.util.UUID;

/**
 * 同款聚合与比价。**这是 {@code standard_spu_id} 的第一个消费者。**
 *
 * <p>此前那一列只写不读：{@code StandardMatcher} 一直在匹配，但没有任何人用结果，
 * 标准品对系统行为零影响。这个形状是让它有意义的落点。
 *
 * @param offers 同款商品列表（每个商家商品一行，带最低价），按价格升序
 * @param pricesBySpec 按规格分组的比价。**这才是买家做决策用的那一半**——
 *     {@code offers} 是聚合视角（同款有哪些在卖），{@code pricesBySpec} 是「同一个规格各家卖多少」
 */
public record SameProductView(UUID standardSpuId, String title, List<Offer> offers, List<SpecPrices> pricesBySpec) {

    /**
     * 一个在卖的商家商品。
     *
     * @param minPrice null = 有 online listing 但所有 SKU 都停售（「暂无报价」，不是「不可售」）
     */
    public record Offer(
            UUID spuId, String title, UUID merchantId, UUID shopId, String imageUrl, Money minPrice, long skuCount) {}

    /**
     * 同一个规格的各家报价。
     *
     * <p>{@code identityKey} 是比价的分组依据（{@code product-model.md} 不变式 6：
     * 比价只按 {@code sku.identity_key} 聚合，不按 SPU）。拿 SPU 最低价比价，
     * 等于拿 128G 的价和 256G 的价比。
     *
     * @param quotes 组内按价格升序。只给最便宜的几家——一个热门型号可能有上百家
     * @param lowest 组内最低价，等于 {@code quotes} 第一条的价；单独给是为了前端不必解空列表
     */
    public record SpecPrices(String identityKey, String specValues, Money lowest, List<Quote> quotes) {}

    /** 一条报价。 */
    public record Quote(UUID skuId, UUID spuId, String title, UUID merchantId, UUID shopId, Money price) {}
}
