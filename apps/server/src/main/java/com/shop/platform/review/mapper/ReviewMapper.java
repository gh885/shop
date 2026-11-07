package com.shop.platform.review.mapper;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * {@code review.review} 的全部 SQL。
 *
 * <p>写路径全是 CAS 条件更新，0 行是判决：窗口过期、已评过、已回复过、状态不对，各自在
 * where 里拦，调用方拿行数给结论——不先查再改，「评了又评」的窗口就是先查那一下。
 *
 * <p>买家私有的读（待评价、我的评价）把 {@code buyer_id} 写进谓词；公开列表按 SPU 圈定，
 * 行本身就是公开展示物，不进 {@code DataScopeTest} 的范围表清单。
 */
@Mapper
public interface ReviewMapper {

    String COLUMNS =
            """
            id, order_group_id AS orderGroupId, seller_order_id AS sellerOrderId, order_line_id AS orderLineId,
            line_no AS lineNo, buyer_id AS buyerId, buyer_name AS buyerName,
            merchant_id AS merchantId, shop_id AS shopId, spu_id AS spuId, sku_id AS skuId,
            title, image_url AS imageUrl, CAST(spec_values AS text) AS specValues, status,
            overall, desc_score AS descScore, service_score AS serviceScore, logistics_score AS logisticsScore,
            content, CAST(images AS text) AS imagesJson, anonymous,
            content2, CAST(images2 AS text) AS images2Json, appended_at AS appendedAt,
            reply_content AS replyContent, reply_at AS replyAt,
            reviewable_until AS reviewableUntil, reviewed_at AS reviewedAt, created_at AS createdAt
            """;

    /** 事件预生成一行待评。重复事件由消费侧 inbox 挡，这里再靠 uq_review_line 兜底。 */
    @Insert(
            """
            INSERT INTO review.review
                (order_group_id, seller_order_id, order_line_id, line_no, buyer_id, merchant_id, shop_id,
                 spu_id, sku_id, title, image_url, spec_values, reviewable_until)
            VALUES (#{r.orderGroupId}, #{r.sellerOrderId}, #{r.orderLineId}, #{r.lineNo}, #{r.buyerId},
                    #{r.merchantId}, #{r.shopId}, #{r.spuId}, #{r.skuId}, #{r.title}, #{r.imageUrl},
                    CAST(#{r.specValues} AS jsonb), #{r.reviewableUntil})
            ON CONFLICT (order_line_id) DO NOTHING
            """)
    int insertPending(@Param("r") PendingRow row);

    record PendingRow(
            UUID orderGroupId,
            UUID sellerOrderId,
            UUID orderLineId,
            int lineNo,
            UUID buyerId,
            UUID merchantId,
            UUID shopId,
            UUID spuId,
            UUID skuId,
            String title,
            String imageUrl,
            String specValues,
            Instant reviewableUntil) {}

    /** 买家取一条自己的待评（提交前核对归属与窗口）。 */
    @Select("SELECT " + COLUMNS + " FROM review.review WHERE id = #{id} AND buyer_id = #{buyerId}")
    Optional<ReviewRow> findForBuyer(@Param("id") UUID id, @Param("buyerId") UUID buyerId);

    /** 提交后回填买家昵称快照（公开列表脱敏展示用）。取不到昵称就存空串，脱敏层兜「买家」。 */
    @Update("UPDATE review.review SET buyer_name = #{name}, updated_at = now() WHERE id = #{id}")
    void saveBuyerName(@Param("id") UUID id, @Param("name") String name);

    /** 提交评价。0 行 = 已评过 / 窗口过期 / 状态不对；原因区分靠调用方的预查。 */
    @Update(
            """
            UPDATE review.review
               SET status = 'published', overall = #{overall}, desc_score = #{descScore},
                   service_score = #{serviceScore}, logistics_score = #{logisticsScore},
                   content = #{content}, images = CAST(#{imagesJson} AS jsonb),
                   anonymous = #{anonymous}, reviewed_at = now(), updated_at = now()
             WHERE id = #{id} AND buyer_id = #{buyerId}
               AND status = 'pending'
               AND reviewable_until > now()
            """)
    int publish(
            @Param("id") UUID id,
            @Param("buyerId") UUID buyerId,
            @Param("overall") int overall,
            @Param("descScore") Integer descScore,
            @Param("serviceScore") Integer serviceScore,
            @Param("logisticsScore") Integer logisticsScore,
            @Param("content") String content,
            @Param("imagesJson") String imagesJson,
            @Param("anonymous") boolean anonymous);

    /**
     * 追评一次。追评窗口由调用方算成时刻传入（MyBatis 不直传 Duration）。
     * 0 行 = 追过 / 不在窗口 / 不是 published。
     */
    @Update(
            """
            UPDATE review.review
               SET content2 = #{content}, images2 = CAST(#{imagesJson} AS jsonb),
                   appended_at = now(), updated_at = now()
             WHERE id = #{id} AND buyer_id = #{buyerId}
               AND status = 'published'
               AND content2 IS NULL
               AND reviewed_at > #{appendedAfter}
            """)
    int append(
            @Param("id") UUID id,
            @Param("buyerId") UUID buyerId,
            @Param("content") String content,
            @Param("imagesJson") String imagesJson,
            @Param("appendedAfter") Instant appendedAfter);

    /**
     * 商家回复一次。店铺范围在 SQL 里（空集合折恒假，不拼 {@code IN ()}）。
     * 0 行 = 已回复 / 非 published / 不在自己的店铺范围。
     */
    @Update(
            """
            <script>
            UPDATE review.review
               SET reply_content = #{content}, reply_at = now(), updated_at = now()
             WHERE id = #{id}
               AND status = 'published'
               AND reply_content IS NULL
               AND shop_id IN
              <choose>
                <when test="shopIds.size() > 0">
                  <foreach collection="shopIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
                </when>
                <otherwise>(SELECT NULL::uuid WHERE false)</otherwise>
              </choose>
            </script>
            """)
    int reply(@Param("id") UUID id, @Param("content") String content, @Param("shopIds") Collection<UUID> shopIds);

    /** 平台隐藏。0 行 = 不是 published。 */
    @Update(
            """
            UPDATE review.review
               SET status = 'hidden', updated_at = now()
             WHERE id = #{id} AND status = 'published'
            """)
    int hide(@Param("id") UUID id);

    /** 平台恢复。0 行 = 不是 hidden。 */
    @Update(
            """
            UPDATE review.review
               SET status = 'published', updated_at = now()
             WHERE id = #{id} AND status = 'hidden'
            """)
    int restore(@Param("id") UUID id);

    // ── 买家侧读 ─────────────────────────────────────────────────────────────

    /** 待评价列表（pending），cursor 是 (created_at, id)。 */
    // 首段必须是普通字符串：文本块会剥掉行尾空格，"SELECT " 尾空格一剥就成了 SELECTid
    @Select(
            "<script>\nSELECT " + COLUMNS
                    + """
              FROM review.review
             WHERE buyer_id = #{buyerId} AND status = 'pending'
               <if test="cursorAt != null">
                  AND (created_at, id) &lt; (#{cursorAt}, #{cursorId})
               </if>
             ORDER BY created_at DESC, id DESC
             LIMIT #{limit}
            </script>
            """)
    List<ReviewRow> pagePendingForBuyer(
            @Param("buyerId") UUID buyerId,
            @Param("cursorAt") Instant cursorAt,
            @Param("cursorId") UUID cursorId,
            @Param("limit") int limit);

    /** 我的评价（非 pending），cursor 是 (reviewed_at, id)。 */
    @Select(
            "<script>\nSELECT " + COLUMNS
                    + """
              FROM review.review
             WHERE buyer_id = #{buyerId} AND status &lt;&gt; 'pending'
               <if test="cursorAt != null">
                  AND (reviewed_at, id) &lt; (#{cursorAt}, #{cursorId})
               </if>
             ORDER BY reviewed_at DESC, id DESC
             LIMIT #{limit}
            </script>
            """)
    List<ReviewRow> pageMine(
            @Param("buyerId") UUID buyerId,
            @Param("cursorAt") Instant cursorAt,
            @Param("cursorId") UUID cursorId,
            @Param("limit") int limit);

    /** 待评价计数（买家首页卡片）。 */
    @Select("SELECT count(*) FROM review.review WHERE buyer_id = #{buyerId} AND status = 'pending'")
    long countPending(@Param("buyerId") UUID buyerId);

    // ── 公开读（商品详情评价区）───────────────────────────────────────────────

    /**
     * 公开评价列表，cursor 是 (reviewed_at, id)。
     *
     * <p>filter：all（全部）/ with_image（带图）/ good（4-5 星）/ mid（3 星）/ bad（1-2 星）。
     * 只出 published——hidden 是平台处置结果，公开面必须当它不存在。
     */
    @Select(
            "<script>\nSELECT " + COLUMNS
                    + """
              FROM review.review
             WHERE spu_id = #{spuId} AND status = 'published'
               <if test="filter == 'with_image'"> AND (jsonb_array_length(images) &gt; 0 OR jsonb_array_length(images2) &gt; 0)</if>
               <if test="filter == 'good'"> AND overall &gt;= 4</if>
               <if test="filter == 'mid'"> AND overall = 3</if>
               <if test="filter == 'bad'"> AND overall &lt;= 2</if>
               <if test="cursorAt != null">
                  AND (reviewed_at, id) &lt; (#{cursorAt}, #{cursorId})
               </if>
             ORDER BY reviewed_at DESC, id DESC
             LIMIT #{limit}
            </script>
            """)
    List<ReviewRow> pagePublic(
            @Param("spuId") UUID spuId,
            @Param("filter") String filter,
            @Param("cursorAt") Instant cursorAt,
            @Param("cursorId") UUID cursorId,
            @Param("limit") int limit);

    /** 单 SPU 聚合：总数、均分（百分位整数）、各档计数、带图数。实时算，不养投影表。 */
    @Select(
            """
            SELECT count(*) AS total,
                   COALESCE(CAST(round(avg(overall) * 100) AS integer), 0) AS avgScore,
                   count(*) FILTER (WHERE overall >= 4) AS goodCount,
                   count(*) FILTER (WHERE overall = 3) AS midCount,
                   count(*) FILTER (WHERE overall <= 2) AS badCount,
                   count(*) FILTER (WHERE jsonb_array_length(images) > 0 OR jsonb_array_length(images2) > 0)
                       AS withImageCount
              FROM review.review
             WHERE spu_id = #{spuId} AND status = 'published'
            """)
    SpuStats statsOfSpu(@Param("spuId") UUID spuId);

    record SpuStats(long total, int avgScore, long goodCount, long midCount, long badCount, long withImageCount) {}

    // ── 商家侧读 ─────────────────────────────────────────────────────────────

    /**
     * 店铺评价列表（published + hidden：被平台处置的，商家要能看见才知道为什么少了分）。
     * cursor 是 (reviewed_at, id)；star/replied 是可空筛选。
     */
    @Select(
            "<script>\nSELECT " + COLUMNS
                    + """
              FROM review.review
             WHERE shop_id = #{shopId} AND status IN ('published', 'hidden')
               <if test="star != null"> AND overall = #{star}</if>
               <if test="replied != null and replied"> AND reply_content IS NOT NULL</if>
               <if test="replied != null and !replied"> AND reply_content IS NULL</if>
               <if test="cursorAt != null">
                  AND (reviewed_at, id) &lt; (#{cursorAt}, #{cursorId})
               </if>
             ORDER BY reviewed_at DESC, id DESC
             LIMIT #{limit}
            </script>
            """)
    List<ReviewRow> pageForShop(
            @Param("shopId") UUID shopId,
            @Param("star") Integer star,
            @Param("replied") Boolean replied,
            @Param("cursorAt") Instant cursorAt,
            @Param("cursorId") UUID cursorId,
            @Param("limit") int limit);

    // ── 平台侧读 ─────────────────────────────────────────────────────────────

    /** 平台治理列表：status 可空（全部），cursor 是 (created_at, id)。 */
    @Select(
            "<script>\nSELECT " + COLUMNS
                    + """
              FROM review.review
             <if test="status != null"> WHERE status = #{status}</if>
               <if test="status == null and cursorAt != null">
                  WHERE (created_at, id) &lt; (#{cursorAt}, #{cursorId})
               </if>
               <if test="status != null and cursorAt != null">
                  AND (created_at, id) &lt; (#{cursorAt}, #{cursorId})
               </if>
             ORDER BY created_at DESC, id DESC
             LIMIT #{limit}
            </script>
            """)
    List<ReviewRow> pageForAdmin(
            @Param("status") String status,
            @Param("cursorAt") Instant cursorAt,
            @Param("cursorId") UUID cursorId,
            @Param("limit") int limit);

    /** 无归属点查，仅供内部链路（回复/处置前的预查与审计取上下文）。 */
    @Select("SELECT " + COLUMNS + " FROM review.review WHERE id = #{id}")
    Optional<ReviewRow> findInternal(@Param("id") UUID id);
}
