package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.model.Listing;
import com.shop.platform.catalog.model.ListingStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** listing 的写入与点查（含 listing_review 的轮次计数与审核记录）。状态迁移的合法性在 {@link Listing} 里，这里只做带前置条件的 UPDATE。 */
@Mapper
public interface ListingMapper {

    @Insert(
            """
            INSERT INTO catalog.listing (id, spu_id, merchant_id, shop_id, status, submitted_at)
            VALUES (#{id}, #{spuId}, #{merchantId}, #{shopId}, 'pending', now())
            """)
    void insert(
            @Param("id") UUID id,
            @Param("spuId") UUID spuId,
            @Param("merchantId") UUID merchantId,
            @Param("shopId") UUID shopId);

    @Select(
            """
            SELECT id, spu_id AS spuId, merchant_id AS merchantId, shop_id AS shopId, status
              FROM catalog.listing
             WHERE id = #{id}
            """)
    Optional<Listing> find(@Param("id") UUID listingId);

    /** 按 (SPU, 店铺) 找。重提时要先知道"这条 listing 已经存在了吗、什么状态"。 */
    @Select(
            """
            SELECT id, spu_id AS spuId, merchant_id AS merchantId, shop_id AS shopId, status
              FROM catalog.listing
             WHERE spu_id = #{spuId} AND shop_id = #{shopId}
            """)
    Optional<Listing> findBySpuAndShop(@Param("spuId") UUID spuId, @Param("shopId") UUID shopId);

    /** 按 SPU 找全部挂售关系。一个 SPU 可以挂多店，编辑/下架必须逐条处理。 */
    @Select(
            """
            SELECT id, shop_id AS shopId, status
              FROM catalog.listing
             WHERE spu_id = #{spuId}
             ORDER BY created_at
            """)
    List<ListingRef> findRefsBySpu(@Param("spuId") UUID spuId);

    /** 商家停业级联：这个商家所有在线 listing。 */
    @Select(
            """
            SELECT id, spu_id AS spuId, merchant_id AS merchantId, shop_id AS shopId, status
              FROM catalog.listing
             WHERE merchant_id = #{merchantId} AND status = 'online'
            """)
    List<Listing> findOnlineByMerchant(@Param("merchantId") UUID merchantId);

    /** 关店级联：这家店所有在线 listing。 */
    @Select(
            """
            SELECT id, spu_id AS spuId, merchant_id AS merchantId, shop_id AS shopId, status
              FROM catalog.listing
             WHERE shop_id = #{shopId} AND status = 'online'
            """)
    List<Listing> findOnlineByShop(@Param("shopId") UUID shopId);

    record ListingRef(UUID id, UUID shopId, String status) {}

    default int nextRound(UUID listingId) {
        return (int) countReviews(listingId) + 1;
    }

    @Select("SELECT count(*) FROM catalog.listing_review WHERE listing_id = #{listingId}")
    long countReviews(@Param("listingId") UUID listingId);

    /**
     * 条件更新，三个时间戳列按目标状态决定写不写。
     *
     * <p>写成 {@code CASE WHEN :target = 'approved'} 而不是拼 SQL：目标值只有一个来源，
     * 拼字符串就有把 {@code reviewerId} 拼进去的机会。
     */
    @Update(
            """
            UPDATE catalog.listing
               SET status = #{target},
                   approved_at = CASE WHEN #{target} = 'approved' THEN now() ELSE approved_at END,
                   approved_by = CASE WHEN #{target} = 'approved' THEN #{reviewerId} ELSE approved_by END,
                   reject_reason = CASE WHEN #{target} = 'rejected' THEN #{reason} ELSE reject_reason END
             WHERE id = #{id} AND status = #{from}
            """)
    boolean transitionStatus(
            @Param("target") ListingStatus target,
            @Param("reviewerId") UUID reviewerId,
            @Param("reason") String reason,
            @Param("id") UUID id,
            @Param("from") ListingStatus from);

    /** 条件更新：影响 0 行说明别人先改了，调用方必须把它当冲突，不能吞掉。 */
    default boolean transition(Listing listing, ListingStatus target, UUID reviewerId, String reason) {
        return transitionStatus(target, reviewerId, reason, listing.id(), listing.status());
    }

    @Insert(
            """
            INSERT INTO catalog.listing_review (listing_id, round, decision, reason, reviewer)
            VALUES (#{listingId}, #{round}, #{decision}, #{reason}, #{reviewerId})
            """)
    void review(
            @Param("listingId") UUID listingId,
            @Param("round") int round,
            @Param("decision") String decision,
            @Param("reason") String reason,
            @Param("reviewerId") UUID reviewerId);

    /**
     * 审核队列。只列 pending——已审的不是队列，是历史。
     *
     * <p><b>按提交时间正序，不是倒序。</b> 审核队列是 FIFO：先提交的先审。
     * 倒序会让老单子永远压在底下，而商家侧看到的只是"审核中"，没有超时提示——
     * 压三天和压三十分钟在商家那里完全一样，等他发现时已经过了大促。
     *
     * <p>带 SPU 标题和已审轮次：审核员判"这条商品合不合规"要看见商品，
     * 只给一个 listing id 让他一条条点进去，一个队列翻十页。
     * 轮次同样要看见——第 3 次重提的商品和第 1 次不是一回事，前两次为什么驳回得能查到。
     *
     * <p>{@code LIMIT} 由调用方给。审核队列靠人处理，一次拉一万条没有意义，
     * 而它会随大促涨到那个量级。
     *
     * @param merchantId 传 null 看全平台的队列，传了只看这家店的提交——处理商家申诉时用
     * @param limit 一次最多多少条。上限由调用方定，这里不猜
     */
    @Select(
            """
            <script>
            SELECT o.id AS listingId, o.spu_id AS spuId, o.merchant_id AS merchantId, o.shop_id AS shopId,
                   o.status,
                   o.submitted_at AS submittedAt,
                   s.title AS spuTitle,
                   (SELECT count(*) FROM catalog.listing_review r WHERE r.listing_id = o.id) AS reviewCount
              FROM catalog.listing o
              JOIN catalog.spu s ON s.id = o.spu_id
             WHERE o.status = 'pending'
            <if test="merchantId != null">
               AND o.merchant_id = #{merchantId}
            </if>
             ORDER BY o.submitted_at
             LIMIT #{limit}
            </script>
            """)
    List<PendingOffer> findPending(@Param("merchantId") UUID merchantId, @Param("limit") int limit);

    /** 队列里的一条。审核员要看见的东西：哪个商品、第几轮、什么时候提交的。 */
    record PendingOffer(
            UUID listingId,
            UUID spuId,
            UUID merchantId,
            UUID shopId,
            String spuTitle,
            int reviewCount,
            Instant submittedAt) {}
}
