package com.shop.platform.catalog.mapper;

import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 同款聚合与跨店比价：{@code standard_spu_id} 的第一个真实消费者。
 *
 * <p><b>此前这一列只写不读。</b> {@code StandardMatcher} 一直在往库里写，但没有任何人用这个结果，
 * 于是标准品的存在对系统行为零影响。这个 mapper 是让它有意义的落点。
 *
 * <p><b>比价按 {@code sku.identity_key} 分组，不按 SPU。</b> 这是 {@code product-model.md}
 * 不变式 6：拿 SPU 最低价比价，等于拿 128G 的价和 256G 的价比。一个标准品下有多个规格，
 * 每个规格各自比价才有意义。
 */
@Mapper
public interface StandardPriceReadMapper {

    /**
     * 同款聚合：给定一个标准品，列出所有挂在它上面的商家商品，各带最低价。
     *
     * <p>只有 {@code online} 的商品进来——这是「现在能不能买」，不是「曾经有没有人卖」。
     * 已合并的标准品先顺着 {@code merged_into} 找到终点再查，所以调用方不需要自己解链。
     *
     * <p>{@code DISTINCT ON (s.id)} + {@code ORDER BY s.id, o.id}：一个商家商品可能在多个店挂售
     * （同一 SPU 多个 listing），取 listing id 最小的那个——和 {@code SkuMapper.findSellable}
     * 同一条规则，保证同一请求多次查询结果一致。
     */
    @Select(
            """
            WITH RECURSIVE resolve(id, merged_into, depth) AS (
                SELECT id, merged_into, 0 FROM catalog.spu
                 WHERE id = #{standardSpuId} AND spu_type = 'standard'
                UNION ALL
                SELECT s.id, s.merged_into, r.depth + 1
                  FROM resolve r
                  JOIN catalog.spu s ON s.id = r.merged_into
                 WHERE r.merged_into IS NOT NULL AND r.depth < 20
            ),
            target AS (
                SELECT id FROM resolve WHERE merged_into IS NULL ORDER BY depth DESC LIMIT 1
            )
            SELECT DISTINCT ON (s.id)
                   s.id                AS spuId,
                   s.title             AS title,
                   s.merchant_id       AS merchantId,
                   o.shop_id           AS shopId,
                   (SELECT m.url FROM catalog.spu_media m
                     WHERE m.spu_id = s.id AND m.attribute_id IS NULL AND m.media_type = 'image'
                     ORDER BY m.sort, m.created_at FETCH FIRST 1 ROW ONLY) AS imageUrl,
                   (SELECT min(k.price_amount) FROM catalog.sku k
                     WHERE k.spu_id = s.id AND k.status = 'active') AS minPriceAmount,
                   (SELECT k.price_currency FROM catalog.sku k
                     WHERE k.spu_id = s.id AND k.status = 'active'
                     ORDER BY k.price_amount FETCH FIRST 1 ROW ONLY) AS minPriceCurrency,
                   (SELECT count(*) FROM catalog.sku k
                     WHERE k.spu_id = s.id AND k.status = 'active') AS skuCount
              FROM catalog.spu s
              JOIN catalog.listing o ON o.spu_id = s.id AND o.status = 'online'
             WHERE s.standard_spu_id = (SELECT id FROM target)
               AND s.spu_type = 'merchant'
             ORDER BY s.id, o.id
            """)
    List<SameProductRow> findSameProductOffers(@Param("standardSpuId") UUID standardSpuId);

    /**
     * 按规格比价：同一个标准品下，同一个 {@code identity_key} 的各家报价。
     *
     * <p><b>这是「比价」真正的形状。</b> 上面那条给的是「同款商品有哪些在卖」，
     * 这一条给的是「同一个规格，各家卖多少」——前者是聚合视角，后者才是买家做决策用的。
     *
     * <p>只取 {@code identity_key IS NOT NULL} 的 SKU：认不出规格的（白牌非标、没填条码）
     * 无法确认是不是同一个东西，把它们混进比价就是错的。
     *
     * <p>按 {@code identity_key} 分组，组内按价格升序。{@code LIMIT} 由调用方给——
     * 一个热门型号可能有上百家，详情页只需要最便宜的那几家。
     */
    @Select(
            """
            WITH RECURSIVE resolve(id, merged_into, depth) AS (
                SELECT id, merged_into, 0 FROM catalog.spu
                 WHERE id = #{standardSpuId} AND spu_type = 'standard'
                UNION ALL
                SELECT s.id, s.merged_into, r.depth + 1
                  FROM resolve r
                  JOIN catalog.spu s ON s.id = r.merged_into
                 WHERE r.merged_into IS NOT NULL AND r.depth < 20
            ),
            target AS (
                SELECT id FROM resolve WHERE merged_into IS NULL ORDER BY depth DESC LIMIT 1
            )
            SELECT k.identity_key      AS identityKey,
                   CAST(k.spec_values AS text) AS specValues,
                   k.id                AS skuId,
                   k.spu_id            AS spuId,
                   s.title             AS title,
                   s.merchant_id       AS merchantId,
                   o.shop_id           AS shopId,
                   k.price_amount      AS priceAmount,
                   k.price_currency    AS priceCurrency
              FROM catalog.sku k
              JOIN catalog.spu s     ON s.id = k.spu_id
              JOIN catalog.listing o ON o.spu_id = s.id AND o.status = 'online'
             WHERE s.standard_spu_id = (SELECT id FROM target)
               AND s.spu_type = 'merchant'
               AND k.status = 'active'
               AND k.identity_key IS NOT NULL
             ORDER BY k.identity_key, k.price_amount
            """)
    List<PriceOfferRow> findPriceOffers(@Param("standardSpuId") UUID standardSpuId);

    /**
     * 商家侧：本店有多少商品挂在这个标准品上。
     *
     * <p>卖家挂靠前先看「是不是已经挂过同一批货」——挂靠错了会让自家两个商品互相被当成同款，
     * 而比价里出现自己打自己是最容易发现也最尴尬的错配。
     */
    @Select(
            """
            SELECT count(*) FROM catalog.spu
             WHERE standard_spu_id = #{standardSpuId}
               AND merchant_id = #{merchantId}
               AND spu_type = 'merchant'
            """)
    long countBoundByMerchant(@Param("standardSpuId") UUID standardSpuId, @Param("merchantId") UUID merchantId);

    /** 同款商品的一行。{@code minPriceAmount} 可空 = 有 online listing 但无 active SKU。 */
    record SameProductRow(
            UUID spuId,
            String title,
            UUID merchantId,
            UUID shopId,
            String imageUrl,
            Long minPriceAmount,
            String minPriceCurrency,
            long skuCount) {}

    /** 一个规格的一条报价。 */
    record PriceOfferRow(
            String identityKey,
            String specValues,
            UUID skuId,
            UUID spuId,
            String title,
            UUID merchantId,
            UUID shopId,
            long priceAmount,
            String priceCurrency) {}
}
