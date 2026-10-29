package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.api.CatalogQuery;
import com.shop.platform.common.money.Money;
import com.shop.platform.infra.db.JsonColumns;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

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
                 price_amount, price_currency, weight_g,
                 original_price_amount, merchant_id, merchant_code)
            VALUES (#{row.id}, #{row.spuId}, CAST(#{row.specValuesJson} AS jsonb), #{row.specKey},
                    #{row.barcode}, #{row.identityKey}, #{row.priceAmount}, #{row.priceCurrency}, #{row.weightG},
                    #{row.originalPriceAmount}, #{row.merchantId}, #{row.merchantCode})
            """)
    void insert(@Param("row") NewSku sku);

    default void insertSku(
            UUID skuId,
            UUID spuId,
            UUID merchantId,
            Map<UUID, String> specs,
            Money price,
            Money originalPrice,
            Integer weightG,
            String barcode,
            String merchantCode,
            String identityKey) {
        insert(new NewSku(
                skuId,
                spuId,
                JsonColumns.write(specs == null ? Map.of() : specs),
                SpuMapper.specKey(specs),
                barcode,
                identityKey,
                price.amount(),
                price.currency(),
                weightG,
                originalPrice == null ? null : originalPrice.amount(),
                merchantId,
                merchantCode));
    }

    @Select("SELECT id FROM catalog.sku WHERE spu_id = #{spuId}")
    List<UUID> skuIds(@Param("spuId") UUID spuId);

    /** 这个 SPU 已有的规格键。新增 SKU 前先查一遍，把唯一键冲突变成能定位的 409。 */
    @Select("SELECT spec_key FROM catalog.sku WHERE spu_id = #{spuId}")
    List<String> specKeys(@Param("spuId") UUID spuId);

    /** 商家货号在商家内是否已被别的 SKU 占用。{@code excludeSkuId} 用于编辑自己。 */
    @Select(
            """
            SELECT EXISTS (
                SELECT 1 FROM catalog.sku
                 WHERE merchant_id = #{merchantId}
                   AND lower(merchant_code) = lower(#{merchantCode})
                   AND (#{excludeSkuId} IS NULL OR id <> #{excludeSkuId})
            )
            """)
    boolean merchantCodeTaken(
            @Param("merchantId") UUID merchantId,
            @Param("merchantCode") String merchantCode,
            @Param("excludeSkuId") UUID excludeSkuId);

    /**
     * 提交 / 重新上架前的存量复验：每条 <b>active</b> SKU 的规格 JSON 与条码。
     *
     * <p>停售的 SKU 不参与：它们不卖，规格/条码不合法也不该挡住重提。
     * 新增 SKU 时也用它比规格维度——维度只需和还在卖的 SKU 对齐。
     */
    @Select(
            """
            SELECT CAST(spec_values AS text) AS specValuesJson, barcode
              FROM catalog.sku
             WHERE spu_id = #{spuId} AND status = 'active'
             ORDER BY spec_key
            """)
    List<SpecRow> findSpecRows(@Param("spuId") UUID spuId);

    /** 这个 SPU 还有几条 active SKU。改完 SKU 后用它判「一个都不留」。 */
    @Select("SELECT count(*) FROM catalog.sku WHERE spu_id = #{spuId} AND status = 'active'")
    long countActive(@Param("spuId") UUID spuId);

    /**
     * 改价 / 改重 / 停售。<b>按 (spuId, skuId) 双键定位</b>——只按 skuId 就把“这个 sku 是不是这个 spu 的”
     * 交给调用方在 Java 里比对，那是越权面的起点。
     *
     * <p><b>停售走 {@code status = 'disabled'}，不是删行。</b> {@code trade.order_line} 存着 sku_id，
     * 删了历史订单的“买的到底是什么”就断了一条线（订单有标题/图快照，但规格身份靠这个 id 回溯）。
     * 停售的商品不会出现在可售点查里（{@code findSellable} 只认 {@code status = 'active'}），
     * 效果与删等价，但不破坏历史。
     *
     * <p><b>为什么不能改规格。</b> 规格决定 {@code spec_key} 与 {@code identity_key}，
     * 后者是比价和售后认规格的依据。改规格等于把这个 SKU 变成另一个商品，
     * 而历史订单里那条 sku_id 还指着它——买“红/L”的人变成了买“蓝/M”。
     * 要换规格就停售旧 SKU、建新 SKU。
     *
     * <p>{@code updated_at} 由触发器 {@code trg_sku_touch} 维护。
     *
     * <p>{@code status} 传 null 表示「保持当前状态」——编辑表单里一条已停售的 SKU
     * 不该因为没带 status 就悄悄重新上架。
     */
    @Update(
            """
            UPDATE catalog.sku
               SET price_amount   = #{priceAmount},
                   price_currency = #{priceCurrency},
                   weight_g       = #{weightG},
                   original_price_amount = #{originalPriceAmount},
                   merchant_code  = #{merchantCode},
                   status         = COALESCE(CAST(#{status} AS text), status)
             WHERE id = #{skuId} AND spu_id = #{spuId}
            """)
    int updateSku(
            @Param("spuId") UUID spuId,
            @Param("skuId") UUID skuId,
            @Param("priceAmount") long priceAmount,
            @Param("priceCurrency") String priceCurrency,
            @Param("weightG") Integer weightG,
            @Param("originalPriceAmount") Long originalPriceAmount,
            @Param("merchantCode") String merchantCode,
            @Param("status") String status);

    /**
     * 停售。<b>只改状态，不碰价格和重量。</b>
     *
     * <p>用 {@link #updateSku} 顺手写 {@code price_amount = 0} 会让停售的规格丢掉价格；
     * 下次表单把它带回来时就是一条 ¥0 的 active SKU，而 schema 和 {@code Money} 都允许 0。
     */
    @Update("UPDATE catalog.sku SET status = 'disabled' WHERE id = #{skuId} AND spu_id = #{spuId}")
    int disable(@Param("spuId") UUID spuId, @Param("skuId") UUID skuId);

    /**
     * 这家店卖过这个 SKU 吗（含已取消的单）。
     *
     * <p>删草稿前要问它：SPU 一旦被引用，删了就是悬空引用。
     * 而 {@code order_line} 是只追加的——即使订单后来取消了，那一行也还在。
     */
    @Select(
            """
            SELECT EXISTS (
                SELECT 1 FROM trade.order_line l WHERE l.sku_id = #{skuId}
            )
            """)
    boolean isReferencedByOrder(@Param("skuId") UUID skuId);

    /**
     * 删 SKU 行。<b>只给草稿删除用</b>，且调用方必须先确认没有任何订单引用它。
     *
     * <p>平时停售走 {@link #updateSku} 的 {@code disabled}，不要调这个。
     */
    @Delete("DELETE FROM catalog.sku WHERE spu_id = #{spuId}")
    int deleteAllOfSpu(@Param("spuId") UUID spuId);

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
            Integer weightG,
            Long originalPriceAmount,
            UUID merchantId,
            String merchantCode) {}

    /** 存量 SKU 的复验输入。 */
    record SpecRow(String specValuesJson, String barcode) {}

    /**
     * 只有 {@code listing.status = 'online'} 且 {@code sku.status = 'active'} 才算可售。
     *
     * <p>{@code fetch first 1 row only} 是因为一个 SPU 可能在多个店挂售，同一 SKU 就有多个 listing；
     * 买家点的是哪个店由 listing 决定，但算价只要一个确定的价——按 listing id 排序取第一个，
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
                   o.id                AS listingId,
                   o.merchant_id       AS merchantId,
                   o.shop_id           AS shopId,
                   s.category_id       AS categoryId,
                   s.brand_id          AS brandId,
                   s.title             AS title,
                   s.seven_day_return  AS sevenDayReturn,
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
              JOIN catalog.category c ON c.id = s.category_id AND c.status IN ('active', 'frozen')
              JOIN catalog.listing o ON o.spu_id = s.id AND o.status = 'online'
             WHERE k.id = #{skuId} AND k.status = 'active'
             ORDER BY o.id
             FETCH FIRST 1 ROW ONLY
            """)
    Optional<SellableRow> findSellable(@Param("skuId") UUID skuId);

    /**
     * 批查版可售点查：与 {@link #findSellable} 同一谓词、同一列集，按集合取。
     *
     * <p>{@code DISTINCT ON (k.id)} 是因为一个 SPU 可在多店挂售、同一 SKU 命中多个 listing；
     * 和点查同一条规则——按 listing id 排序取第一个，保证两次查同一辆车结果一致。
     */
    @Select(
            """
            <script>
            SELECT DISTINCT ON (k.id)
                   k.id                AS id,
                   s.id                AS spuId,
                   o.id                AS listingId,
                   o.merchant_id       AS merchantId,
                   o.shop_id           AS shopId,
                   s.category_id       AS categoryId,
                   s.brand_id          AS brandId,
                   s.title             AS title,
                   s.seven_day_return  AS sevenDayReturn,
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
              JOIN catalog.category c ON c.id = s.category_id AND c.status IN ('active', 'frozen')
              JOIN catalog.listing o ON o.spu_id = s.id AND o.status = 'online'
             WHERE k.status = 'active'
               AND k.id IN <foreach collection="skuIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
             ORDER BY k.id, o.id
            </script>
            """)
    List<SellableRow> findSellableByIds(@Param("skuIds") java.util.Collection<UUID> skuIds);

    /**
     * 可售点查的一行。价格拆两列拿原始形状，Money 由 {@link #toSellable()} 组装，
     * 保持 {@link CatalogQuery} 边界上只有一个金额形状。
     */
    record SellableRow(
            UUID id,
            UUID spuId,
            UUID listingId,
            UUID merchantId,
            UUID shopId,
            UUID categoryId,
            UUID brandId,
            Long priceAmount,
            String priceCurrency,
            Integer weightG,
            String title,
            boolean sevenDayReturn,
            String imageUrl,
            String specValues,
            String identityKey) {

        CatalogQuery.SellableSku toSellable() {
            return new CatalogQuery.SellableSku(
                    id,
                    spuId,
                    listingId,
                    merchantId,
                    shopId,
                    categoryId,
                    brandId,
                    new Money(priceAmount, priceCurrency),
                    weightG,
                    title,
                    imageUrl,
                    specValues,
                    identityKey,
                    sevenDayReturn);
        }
    }
}
