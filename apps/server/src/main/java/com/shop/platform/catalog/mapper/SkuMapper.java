package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.api.CatalogQuery;
import com.shop.platform.common.money.Money;
import com.shop.platform.infra.db.JsonColumns;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * SKU 的写入与可售点查。规格值的 jsonb 存储与 spec_key 唯一性兜底见 {@link SpuMapper}。
 */
@Mapper
public interface SkuMapper {

    /**
     * 建 SKU。status 由列默认 'active' 落值，insert 不碰。
     *
     * @param identityKey 规格身份键（GTIN 或参数哈希）。{@code null} = 认不出来
     * @param barcode 条码原文。和 {@code identityKey} 分开存：后者是规范化后的比对键，
     *     前者是商家填的原样——排查"为什么这两个没归并到一起"时要能看见原文
     */
    @Insert(
            """
            INSERT INTO catalog.sku
                (id, spu_id, spec_values, spec_key, barcode, identity_key,
                 price_amount, price_currency, weight_g)
            VALUES (#{row.id}, #{row.spuId}, CAST(#{row.specValuesJson} AS jsonb), #{row.specKey},
                    #{row.barcode}, #{row.identityKey}, #{row.priceAmount}, #{row.priceCurrency}, #{row.weightG})
            """)
    void insert(@Param("row") NewSku sku);

    default void insertSku(
            UUID skuId,
            UUID spuId,
            Map<UUID, String> specs,
            Money price,
            Integer weightG,
            String barcode,
            String identityKey) {
        insert(new NewSku(
                skuId,
                spuId,
                JsonColumns.write(specs),
                SpuMapper.specKey(specs),
                barcode,
                identityKey,
                price.amount(),
                price.currency(),
                weightG));
    }

    @Select("SELECT id FROM catalog.sku WHERE spu_id = #{spuId}")
    List<UUID> skuIds(@Param("spuId") UUID spuId);

    /** 建 SKU 的一行。spec_values 的 jsonb 原文由 insert 里 CAST 落库。 */
    record NewSku(
            UUID id,
            UUID spuId,
            String specValuesJson,
            String specKey,
            String barcode,
            String identityKey,
            long priceAmount,
            String priceCurrency,
            Integer weightG) {}

    /**
     * 只有 {@code offer.status = 'online'} 且 {@code sku.status = 'active'} 才算可售。
     *
     * <p>{@code fetch first 1 row only} 是因为一个 SPU 可能在多个店挂售，同一 SKU 就有多个 offer；
     * 买家点的是哪个店由 offer 决定，但算价只要一个确定的价——按 offer id 排序取第一个，
     * 保证同一请求多次算价结果一致。
     *
     * <p>主图取 {@code spu_media} 里第一条通用图（{@code attribute_id IS NULL}），按 {@code sort} 排。
     * 子查询而不是 JOIN：一个 SPU 有多张图，JOIN 会让结果集出现多行，
     * 而 {@code fetch first 1 row only} 会让"取哪张图"变成不确定的事。
     */
    @Select(
            """
            SELECT k.id                AS id,
                   s.id                AS spuId,
                   o.id                AS offerId,
                   o.merchant_id       AS merchantId,
                   o.shop_id           AS shopId,
                   s.category_id       AS categoryId,
                   s.brand_id          AS brandId,
                   s.title             AS title,
                   (SELECT m.url
                      FROM catalog.spu_media m
                     WHERE m.spu_id = s.id
                       AND m.attribute_id IS NULL
                       AND m.media_type = 'image'
                     ORDER BY m.sort, m.created_at
                     FETCH FIRST 1 ROW ONLY) AS imageUrl,
                   CAST(k.spec_values AS text) AS specValues,
                   k.identity_key      AS identityKey,
                   k.price_amount      AS priceAmount,
                   k.price_currency    AS priceCurrency,
                   k.weight_g          AS weightG
              FROM catalog.sku k
              JOIN catalog.spu s   ON s.id = k.spu_id
              JOIN catalog.offer o ON o.spu_id = s.id AND o.status = 'online'
             WHERE k.id = #{skuId} AND k.status = 'active'
             ORDER BY o.id
             FETCH FIRST 1 ROW ONLY
            """)
    Optional<SellableRow> findSellable(@Param("skuId") UUID skuId);

    /**
     * 可售点查的一行。价格拆两列拿原始形状，Money 由 {@link #toSellable()} 组装，
     * 保持 {@link CatalogQuery} 边界上只有一个金额形状。
     */
    record SellableRow(
            UUID id,
            UUID spuId,
            UUID offerId,
            UUID merchantId,
            UUID shopId,
            UUID categoryId,
            UUID brandId,
            Long priceAmount,
            String priceCurrency,
            Integer weightG,
            String title,
            String imageUrl,
            String specValues,
            String identityKey) {

        CatalogQuery.SellableSku toSellable() {
            return new CatalogQuery.SellableSku(
                    id,
                    spuId,
                    offerId,
                    merchantId,
                    shopId,
                    categoryId,
                    brandId,
                    new Money(priceAmount, priceCurrency),
                    weightG,
                    title,
                    imageUrl,
                    specValues,
                    identityKey);
        }
    }
}
