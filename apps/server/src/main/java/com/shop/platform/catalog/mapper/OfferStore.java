package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.model.Offer;
import com.shop.platform.catalog.model.OfferStatus;
import com.shop.platform.infra.db.RowMappers;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** offer 的写入与点查。状态迁移的合法性在 {@link Offer} 里，这里只做带前置条件的 UPDATE。 */
@Component
public class OfferStore {

    private static final String INSERT =
            """
            INSERT INTO catalog.offer (id, spu_id, merchant_id, shop_id, status, submitted_at)
            VALUES (:id, :spuId, :merchantId, :shopId, 'pending', now())
            """;

    private static final String FIND =
            """
            SELECT id, spu_id, merchant_id, shop_id, status
              FROM catalog.offer
             WHERE id = :id
            """;

    private static final String FIND_BY_SPU_AND_SHOP =
            """
            SELECT id, spu_id, merchant_id, shop_id, status
              FROM catalog.offer
             WHERE spu_id = :spuId AND shop_id = :shopId
            """;

    /**
     * 这一条 offer 已经审核过几轮。
     *
     * <p>重提时用它算下一轮，不能硬编码 1——原来三个调用点都写死 1，
     * 于是 {@code uq_offer_review_round} 这条唯一约束永远不会被触发，
     * 「驳回后重提 round+1」的列设计意图完全落空。
     */
    private static final String COUNT_REVIEWS = "SELECT count(*) FROM catalog.offer_review WHERE offer_id = :offerId";

    /**
     * 条件更新，三个时间戳列按目标状态决定写不写。
     *
     * <p>写成 {@code CASE WHEN :target = 'approved'} 而不是拼 SQL：目标值只有一个来源，
     * 拼字符串就有把 {@code reviewerId} 拼进去的机会。
     */
    private static final String UPDATE_STATUS =
            """
            UPDATE catalog.offer
               SET status = :target,
                   approved_at = CASE WHEN :target = 'approved' THEN now() ELSE approved_at END,
                   approved_by = CASE WHEN :target = 'approved' THEN :reviewerId ELSE approved_by END,
                   reject_reason = CASE WHEN :target = 'rejected' THEN :reason ELSE reject_reason END
             WHERE id = :id AND status = :from
            """;

    private static final String INSERT_REVIEW =
            """
            INSERT INTO catalog.offer_review (offer_id, round, decision, reason, reviewer)
            VALUES (:offerId, :round, :decision, :reason, :reviewerId)
            """;

    /**
     * 审核队列。只列 pending——已审的不是队列，是历史。
     *
     * <p><b>按提交时间正序，不是倒序。</b> 审核队列是 FIFO：先提交的先审。
     * 倒序会让老单子永远压在底下，而商家侧看到的只是"审核中"，没有超时提示——
     * 压三天和压三十分钟在商家那里完全一样，等他发现时已经过了大促。
     *
     * <p>带 SPU 标题和已审轮次：审核员判"这条商品合不合规"要看见商品，
     * 只给一个 offer id 让他一条条点进去，一个队列翻十页。
     * 轮次同样要看见——第 3 次重提的商品和第 1 次不是一回事，前两次为什么驳回得能查到。
     *
     * <p>{@code LIMIT} 由调用方给。审核队列靠人处理，一次拉一万条没有意义，
     * 而它会随大促涨到那个量级。
     */
    private static final String FIND_PENDING =
            """
            SELECT o.id, o.spu_id, o.merchant_id, o.shop_id, o.status,
                   o.submitted_at,
                   s.title AS spu_title,
                   (SELECT count(*) FROM catalog.offer_review r WHERE r.offer_id = o.id) AS review_count
              FROM catalog.offer o
              JOIN catalog.spu s ON s.id = o.spu_id
             WHERE o.status = 'pending'
             ORDER BY o.submitted_at
             LIMIT :limit
            """;

    private final RowMapper<Offer> MAPPER = RowMappers.of(Offer.class);

    private final JdbcClient jdbc;

    public OfferStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void insert(Offer offer) {
        jdbc.sql(INSERT)
                .param("id", offer.id())
                .param("spuId", offer.spuId())
                .param("merchantId", offer.merchantId())
                .param("shopId", offer.shopId())
                .update();
    }

    public Optional<Offer> find(UUID offerId) {
        return jdbc.sql(FIND).param("id", offerId).query(MAPPER).optional();
    }

    /** 按 (SPU, 店铺) 找。重提时要先知道"这条 offer 已经存在了吗、什么状态"。 */
    public Optional<Offer> findBySpuAndShop(UUID spuId, UUID shopId) {
        return jdbc.sql(FIND_BY_SPU_AND_SHOP)
                .param("spuId", spuId)
                .param("shopId", shopId)
                .query(MAPPER)
                .optional();
    }

    /** 下一轮审核的轮次：已审过的次数 + 1。第一次提交是 1。 */
    public int nextRound(UUID offerId) {
        Integer reviewed = jdbc.sql(COUNT_REVIEWS)
                .param("offerId", offerId)
                .query(Integer.class)
                .single();
        return (reviewed == null ? 0 : reviewed) + 1;
    }

    /** 条件更新：影响 0 行说明别人先改了，调用方必须把它当冲突，不能吞掉。 */
    public boolean transition(Offer offer, OfferStatus target, UUID reviewerId, String reason) {
        return jdbc.sql(UPDATE_STATUS)
                        .param("target", target.name().toLowerCase(Locale.ROOT))
                        .param("reviewerId", reviewerId)
                        .param("reason", reason)
                        .param("id", offer.id())
                        .param("from", offer.status().name().toLowerCase(Locale.ROOT))
                        .update()
                == 1;
    }

    public void review(UUID offerId, int round, String decision, String reason, UUID reviewerId) {
        jdbc.sql(INSERT_REVIEW)
                .param("offerId", offerId)
                .param("round", round)
                .param("decision", decision)
                .param("reason", reason)
                .param("reviewerId", reviewerId)
                .update();
    }

    /**
     * 审核队列。FIFO，见 {@link #FIND_PENDING} 的注释。
     *
     * @param merchantId 传 null 看全平台的队列，传了只看这家店的提交——处理商家申诉时用
     * @param limit 一次最多多少条。上限由调用方定，这里不猜
     */
    public List<PendingOffer> findPending(UUID merchantId, int limit) {
        String sql = FIND_PENDING + (merchantId == null ? "" : "\n AND o.merchant_id = :merchantId");
        var spec = jdbc.sql(sql).param("limit", limit);
        if (merchantId != null) {
            spec = spec.param("merchantId", merchantId);
        }
        return spec.query((rs, row) -> new PendingOffer(
                        rs.getObject("id", UUID.class),
                        rs.getObject("spu_id", UUID.class),
                        rs.getObject("merchant_id", UUID.class),
                        rs.getObject("shop_id", UUID.class),
                        rs.getString("spu_title"),
                        rs.getInt("review_count"),
                        toInstant(rs.getTimestamp("submitted_at"))))
                .list();
    }

    /**
     * {@code timestamptz} 转 {@link Instant}。
     *
     * <p>不能用 {@code getObject(col, Instant.class)}——PostgreSQL 驱动不支持这个转换，
     * 直接抛 {@code conversion to class java.time.Instant from timestamptz not supported}。
     * 走 {@code Timestamp} 再转，是全项目读时间列的统一做法（其余地方由
     * {@code DataClassRowMapper} 代劳，这里手写 mapper 所以自己转）。
     */
    private static Instant toInstant(java.sql.Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    /** 队列里的一条。审核员要看见的东西：哪个商品、第几轮、什么时候提交的。 */
    public record PendingOffer(
            UUID offerId,
            UUID spuId,
            UUID merchantId,
            UUID shopId,
            String spuTitle,
            int reviewCount,
            Instant submittedAt) {}
}
