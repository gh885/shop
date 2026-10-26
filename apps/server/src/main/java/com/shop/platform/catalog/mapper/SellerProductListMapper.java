package com.shop.platform.catalog.mapper;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 卖家商品列表的读模型。
 *
 * <p><b>为什么这个 mapper 必须存在。</b> 在它之前，商家没有任何办法列出自己的商品——
 * 所有商品端点的路径参数都是 {@code spuId}，而他拿不到那些 id。于是「建完商品、想再改一下」
 * 这条路在界面上是不可达的：接口都在，入口没有。卖家订单列表当初缺的是同一个东西。
 *
 * <h2>三条与买家侧不同的规矩</h2>
 *
 * <ul>
 *   <li><b>任何状态都列</b>：草稿、审核中、被驳回、已下架、已上架。买家侧只认 online，
 *       而商家最需要看的恰恰是「我那个被驳回的」和「还没提交的」
 *   <li><b>不按店铺过滤，按商家过滤</b>：一个 SPU 可能挂在多个店铺（{@code listing} 一对多），
 *       按店铺筛会让同一个商品在不同店铺下重复出现。商家视角是「我的商品」，不是「我的店铺的商品」
 *   <li><b>列表不带 SKU 明细</b>，只带聚合（SKU 数、最低价、库存合计）。一页 20 条商品
 *       乘上平均 5 个 SKU 就是 100 行，而列表卡片只显示「¥99 起 · 12 件」
 * </ul>
 */
@Mapper
public interface SellerProductListMapper {

    /**
     * 一页商品。
     *
     * <p><b>游标是 {@code (created_at, id)}，与全项目列表同一口径</b>（{@code CursorCodec}）。
     * 只按 {@code created_at} 比会串同一毫秒的行。
     *
     * <p><b>列表本身不碰库存。</b> 库存走 {@code inventory :: api} 批查（见
     * {@link #activeSkuIds} 的注释），不在这一条 SQL 里跨 schema 读别人的表。
     *
     * @param status 筛选的展示态，null = 不过滤。取值见 {@code SellerProductQuery.STATUSES}
     * @param cursorAt / {@code cursorId} 同生同死，都是 null 时是第一页
     */
    @Select(
            """
            <script>
            SELECT s.id            AS spuId,
                   s.title         AS title,
                   s.category_id   AS categoryId,
                   s.created_at    AS createdAt,
                   l.status        AS listingStatus,
                   l.reject_reason AS rejectReason,
                   (SELECT m.url FROM catalog.spu_media m
                     WHERE m.spu_id = s.id AND m.attribute_id IS NULL AND m.media_type = 'image'
                     ORDER BY m.sort, m.created_at FETCH FIRST 1 ROW ONLY) AS imageUrl,
                   (SELECT count(*) FROM catalog.sku k
                     WHERE k.spu_id = s.id AND k.status = 'active') AS skuCount,
                   (SELECT min(k.price_amount) FROM catalog.sku k
                     WHERE k.spu_id = s.id AND k.status = 'active') AS minPriceAmount,
                   (SELECT k.price_currency FROM catalog.sku k
                     WHERE k.spu_id = s.id AND k.status = 'active'
                     ORDER BY k.price_amount FETCH FIRST 1 ROW ONLY) AS minPriceCurrency
              FROM catalog.spu s
              LEFT JOIN catalog.listing l ON l.spu_id = s.id
             WHERE s.merchant_id = #{merchantId}
               AND s.spu_type = 'merchant'
            <if test="status != null">
               AND COALESCE(l.status, 'draft') = #{status}
            </if>
            <if test="keyword != null and keyword != ''">
               AND s.title ILIKE '%' || #{keyword} || '%'
            </if>
            <if test="cursorAt != null">
               AND (s.created_at, s.id) &lt; (#{cursorAt}, #{cursorId})
            </if>
             ORDER BY s.created_at DESC, s.id DESC
             LIMIT #{limit}
            </script>
            """)
    List<Row> page(
            @Param("merchantId") UUID merchantId,
            @Param("status") String status,
            @Param("keyword") String keyword,
            @Param("cursorAt") Instant cursorAt,
            @Param("cursorId") UUID cursorId,
            @Param("limit") int limit);

    /**
     * 按状态计数，给列表页的筛选标签用（「全部 12 · 在售 8 · 审核中 2 · 已驳回 2」）。
     *
     * <p><b>一次查询出全部状态，不是每个状态一次。</b> 四个筛选标签就是四次往返，
     * 而它们必须来自同一个快照——分开查的窗口里商家刚好提交了一个商品，
     * 标签上写「审核中 2」而列表里只有 1 个。
     *
     * <p>用 {@code GROUP BY} 而不是 {@code count(*) FILTER (WHERE ...)} 四次：
     * 前者新增状态时自动出现，后者要手改 SQL。
     */
    @Select(
            """
            SELECT COALESCE(l.status, 'draft') AS status, count(*) AS total
              FROM catalog.spu s
              LEFT JOIN catalog.listing l ON l.spu_id = s.id
             WHERE s.merchant_id = #{merchantId} AND s.spu_type = 'merchant'
             GROUP BY COALESCE(l.status, 'draft')
            """)
    List<StatusCount> countByStatus(@Param("merchantId") UUID merchantId);

    /**
     * 这一页商品的 active SKU，按商品分组。
     *
     * <p><b>为什么不用子查询在列表 SQL 里直接算库存。</b> 那要读 {@code inventory.stock}——
     * 跨 schema 读别人的表，module-map 铁律 5 明令禁止。库存的唯一出口是
     * {@code inventory :: api}，走它是三条查询（列表 → 本页 SKU → 批量库存），
     * 而不是一条 SQL 顺手把别人的表读了。
     *
     * <p>三条查询换来的是：库存口径只有一处定义（{@code InventoryQuery}），
     * 改口径不用改商品模块。而「一页 20 条商品」这个量级，三条查询完全可以接受。
     */
    @Select(
            """
            <script>
            SELECT k.spu_id AS spuId, k.id AS skuId
              FROM catalog.sku k
             WHERE k.status = 'active'
               AND k.spu_id IN
               <foreach collection="spuIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
            </script>
            """)
    List<SkuOfSpu> activeSkuIds(@Param("spuIds") Collection<UUID> spuIds);

    /** 一个商品下的一个 active SKU。 */
    record SkuOfSpu(UUID spuId, UUID skuId) {}

    /** 列表的一行。够画一张卡片：图、标题、状态、SKU 数、起价、库存。 */
    record Row(
            UUID spuId,
            String title,
            UUID categoryId,
            Instant createdAt,
            String listingStatus,
            String rejectReason,
            String imageUrl,
            long skuCount,
            Long minPriceAmount,
            String minPriceCurrency) {}

    /** 一个状态下有多少个商品。 */
    record StatusCount(String status, long total) {}
}
