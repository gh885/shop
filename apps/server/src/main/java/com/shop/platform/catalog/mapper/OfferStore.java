package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.model.Offer;
import com.shop.platform.catalog.model.OfferStatus;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** offer 的写入与点查。状态迁移的合法性在 {@link Offer} 里，这里只做带前置条件的 UPDATE。 */
@Component
public class OfferStore {

    private static final String INSERT =
            """
            INSERT INTO catalog.offer (id, spu_id, merchant_id, shop_id, status, submitted_at)
            VALUES (?, ?, ?, ?, 'pending', now())
            """;

    private static final String FIND =
            """
            SELECT id, spu_id, merchant_id, shop_id, status
              FROM catalog.offer
             WHERE id = ?
            """;

    private static final String UPDATE_STATUS =
            """
            UPDATE catalog.offer
               SET status = ?,
                   approved_at = CASE WHEN ? = 'approved' THEN now() ELSE approved_at END,
                   approved_by = CASE WHEN ? = 'approved' THEN ? ELSE approved_by END,
                   reject_reason = CASE WHEN ? = 'rejected' THEN ? ELSE reject_reason END
             WHERE id = ? AND status = ?
            """;

    private static final String INSERT_REVIEW =
            """
            INSERT INTO catalog.offer_review (offer_id, round, decision, reason, reviewer)
            VALUES (?, ?, ?, ?, ?)
            """;

    private final JdbcTemplate jdbc;

    public OfferStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void insert(Offer offer) {
        jdbc.update(INSERT, offer.id(), offer.spuId(), offer.merchantId(), offer.shopId());
    }

    public Optional<Offer> find(UUID offerId) {
        List<Offer> rows = jdbc.query(
                FIND,
                (rs, row) -> new Offer(
                        rs.getObject("id", UUID.class),
                        rs.getObject("spu_id", UUID.class),
                        rs.getObject("merchant_id", UUID.class),
                        rs.getObject("shop_id", UUID.class),
                        OfferStatus.from(rs.getString("status"))),
                offerId);
        return rows.stream().findFirst();
    }

    /** 条件更新：影响 0 行说明别人先改了，调用方必须把它当冲突，不能吞掉。 */
    public boolean transition(Offer offer, OfferStatus target, UUID reviewerId, String reason) {
        String targetValue = target.name().toLowerCase(Locale.ROOT);
        return jdbc.update(
                        UPDATE_STATUS,
                        targetValue,
                        targetValue,
                        targetValue,
                        reviewerId,
                        targetValue,
                        reason,
                        offer.id(),
                        offer.status().name().toLowerCase(Locale.ROOT))
                == 1;
    }

    public void review(UUID offerId, int round, String decision, String reason, UUID reviewerId) {
        jdbc.update(INSERT_REVIEW, offerId, round, decision, reason, reviewerId);
    }
}
