package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.model.Offer;
import com.shop.platform.catalog.model.OfferStatus;
import com.shop.platform.infra.db.RowMappers;
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

    private static final RowMapper<Offer> MAPPER = RowMappers.of(Offer.class);

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
}
