package com.shop.platform.catalog.mapper;

import com.shop.platform.common.money.Money;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 买家侧的商品浏览读模型：首页 feed / 搜索结果 / 类目页都读它。
 *
 * <p><b>为什么单独一个 mapper 而不是复用卖家那个。</b> 两边的"看得见什么"根本不同：
 *
 * <ul>
 *   <li>卖家看见自己所有状态（草稿/审核中/被驳回）；买家只看见 {@code online} 的 listing
 *   <li>卖家一页要 SKU 数与库存；买家卡片只要图、标题、起价、销量位——多给的字段是白拉
 *   <li>卖家按 merchant 过滤；买家按类目 / 关键词 / 排序逛
 * </ul>
 *
 * <p>硬塞进一条 SQL、用 {@code if} 分支切成两种语义，就是那种"看着省了一个类、
 * 实际每次改动都要同时想两个场景"的代码。所以宁可两处 SQL。
 *
 * <p><b>列表不带 SKU 明细。</b> 卡片只显示"¥99 起"。一页 24 条乘平均 5 个 SKU 是 120 行，
 * 而首页只需要一个最低价。
 */
@Mapper
public interface BuyerProductListMapper {

    /**
     * 一页可售商品。
     *
     * <p><b>可售 = 存在 online listing。</b> 这是全项目唯一的可售判据（见
     * {@code product-model.md}：spu.status 已删，真正状态在 listing）。所以 SQL 里用
     * {@code EXISTS (... status = 'online')} 而不是读某个冗余列。
     *
     * @param categoryId 类目筛选，null = 全部。传的是叶子；分组类目的"选整支"由调用方展开成叶子集合
     * @param keyword 标题模糊匹配，null/空 = 不过滤
     * @param sort 排序：newest / price_asc / price_desc，调用方已校验词表
     * @param cursorAt / cursorId 游标，同生同死，都 null 时是第一页（仅 newest 用它；价格排序用 offset 更简单，见 service）
     */
    @Select(
            """
            <script>
            SELECT s.id         AS spuId,
                   s.title      AS title,
                   s.subtitle   AS subtitle,
                   s.category_id AS categoryId,
                   s.created_at AS createdAt,
                   s.sold_count AS soldCount,
                   s.seven_day_return AS sevenDayReturn,
                   (SELECT m.url FROM catalog.spu_media m
                     WHERE m.spu_id = s.id AND m.attribute_id IS NULL AND m.media_type = 'image'
                     ORDER BY m.sort, m.created_at FETCH FIRST 1 ROW ONLY) AS imageUrl,
                   (SELECT min(k.price_amount) FROM catalog.sku k
                     WHERE k.spu_id = s.id AND k.status = 'active') AS minPriceAmount,
                   (SELECT k.price_currency FROM catalog.sku k
                     WHERE k.spu_id = s.id AND k.status = 'active'
                     ORDER BY k.price_amount FETCH FIRST 1 ROW ONLY) AS minPriceCurrency,
                   (SELECT min(l.shop_id::text) FROM catalog.listing l
                     WHERE l.spu_id = s.id AND l.status = 'online') AS shopId
              FROM catalog.spu s
             WHERE s.spu_type = 'merchant'
               AND EXISTS (
                   SELECT 1 FROM catalog.listing l
                    WHERE l.spu_id = s.id AND l.status = 'online'
               )
               AND EXISTS (
                   SELECT 1 FROM catalog.category c
                    WHERE c.id = s.category_id AND c.status IN ('active', 'frozen')
               )
            <if test="categoryIds != null and categoryIds.size() > 0">
               AND s.category_id IN
               <foreach collection="categoryIds" item="cid" open="(" separator="," close=")">#{cid}</foreach>
            </if>
            <if test="keyword != null and keyword != ''">
               AND (s.title ILIKE '%' || #{keyword} || '%' OR s.subtitle ILIKE '%' || #{keyword} || '%')
            </if>
            <if test="cursorAt != null">
               AND (s.created_at, s.id) &lt; (#{cursorAt}, #{cursorId})
            </if>
             ORDER BY
            <choose>
              <when test="sort == 'price_asc'">
                (SELECT min(k.price_amount) FROM catalog.sku k WHERE k.spu_id = s.id AND k.status = 'active') ASC NULLS LAST, s.created_at DESC, s.id DESC
              </when>
              <when test="sort == 'price_desc'">
                (SELECT min(k.price_amount) FROM catalog.sku k WHERE k.spu_id = s.id AND k.status = 'active') DESC NULLS LAST, s.created_at DESC, s.id DESC
              </when>
              <otherwise>
                s.created_at DESC, s.id DESC
              </otherwise>
            </choose>
             LIMIT #{limit}
            </script>
            """)
    List<Row> page(
            @Param("categoryIds") List<UUID> categoryIds,
            @Param("keyword") String keyword,
            @Param("sort") String sort,
            @Param("cursorAt") Instant cursorAt,
            @Param("cursorId") UUID cursorId,
            @Param("limit") int limit);

    /** 这一页商品的 active SKU 价格，用于按「有库存的最低价」重算起价。 */
    @Select(
            """
            <script>
            SELECT k.spu_id AS spuId, k.id AS skuId, k.price_amount AS priceAmount,
                   k.price_currency AS priceCurrency
              FROM catalog.sku k
             WHERE k.status = 'active'
               AND k.spu_id IN
               <foreach collection="spuIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
            </script>
            """)
    List<SkuPriceRow> activeSkuPrices(@Param("spuIds") List<UUID> spuIds);

    record SkuPriceRow(UUID spuId, UUID skuId, long priceAmount, String priceCurrency) {}

    /** 列表一行。够画一张卡片：主图、标题、起价、所属店铺、上架时间。 */
    record Row(
            UUID spuId,
            String title,
            String subtitle,
            UUID categoryId,
            Instant createdAt,
            long soldCount,
            boolean sevenDayReturn,
            String imageUrl,
            Long minPriceAmount,
            String minPriceCurrency,
            String shopId) {

        /**
         * 转成跨层视图。{@code minPriceAmount} 可空（SPU 有 online listing 但所有 SKU 停用），
         * 那是"暂无报价"不是不可售——展示上仍列出，价格位留空。
         *
         * @param displayMinPrice 调用方按「有库存」重算后的起价；null 时回退 SQL 里的 active 最低价
         */
        public com.shop.platform.catalog.dto.BuyerProductCard toCard(Money displayMinPrice) {
            Money minPrice = displayMinPrice != null
                    ? displayMinPrice
                    : (minPriceAmount == null ? null : new Money(minPriceAmount, minPriceCurrency));
            return new com.shop.platform.catalog.dto.BuyerProductCard(
                    spuId,
                    title,
                    subtitle,
                    categoryId,
                    imageUrl,
                    minPrice,
                    shopId == null ? null : UUID.fromString(shopId),
                    soldCount,
                    sevenDayReturn,
                    createdAt);
        }
    }
}
