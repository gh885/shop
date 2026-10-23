package com.shop.platform.payment.mapper;

import com.shop.platform.infra.db.RowMappers;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 退款单的读写。
 *
 * <p>幂等键是 {@code (payment_id, seller_order_id, reason)}，由库上的唯一索引兜。
 * 同一个售后单重复发 {@code ReturnApproved}，第二发撞唯一键、什么都不做——
 * **不是靠代码判断"退过没有"**，那个判断在并发下一定会漏。
 */
@Component
public class RefundOrderStore {

    private static final String INSERT =
            """
            INSERT INTO payment.refund_order
                (id, refund_no, payment_id, order_group_id, seller_order_id, amount, currency, reason, status)
            VALUES (:id, :refundNo, :paymentId, :orderGroupId, :sellerOrderId, :amount, :currency, :reason, 'pending')
            ON CONFLICT (payment_id, COALESCE(seller_order_id, '00000000-0000-0000-0000-000000000000'::uuid), reason)
                DO NOTHING
            """;

    /** 挂账退款不带子单：seller_order_id 为 NULL 时 = 比较永远不成立，必须用 IS NULL。 */
    private static final String FIND_BY_SUSPENSE_REASON =
            """
            SELECT id, refund_no, payment_id, order_group_id, seller_order_id, amount, currency,
                   reason, status, channel_refund_id, attempts, created_at
              FROM payment.refund_order
             WHERE payment_id = :paymentId AND seller_order_id IS NULL AND reason = :reason
            """;

    private static final String FIND_BY_BIZ =
            """
            SELECT id, refund_no, payment_id, order_group_id, seller_order_id, amount, currency,
                   reason, status, channel_refund_id, attempts, created_at
              FROM payment.refund_order
             WHERE payment_id = :paymentId AND seller_order_id = :sellerOrderId AND reason = :reason
            """;

    private static final String FIND_STALE_PENDING =
            """
            SELECT id, refund_no, payment_id, order_group_id, seller_order_id, amount, currency,
                   reason, status, channel_refund_id, attempts, created_at
              FROM payment.refund_order
             WHERE status = 'pending' AND created_at <= :olderThan AND attempts < :maxAttempts
             ORDER BY created_at
             LIMIT :limit
            """;

    private static final String MARK_SUCCESS =
            """
            UPDATE payment.refund_order
               SET status = 'success', channel_refund_id = :channelRefundId, completed_at = now()
             WHERE id = :id AND status = 'pending'
            """;

    private static final String INCREMENT_ATTEMPTS =
            """
            UPDATE payment.refund_order
               SET attempts = attempts + 1
             WHERE id = :id
            RETURNING attempts
            """;

    private static final RowMapper<RefundRow> MAPPER = RowMappers.of(RefundRow.class);

    private final JdbcClient jdbc;

    public RefundOrderStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void insert(
            UUID id,
            String refundNo,
            UUID paymentId,
            UUID orderGroupId,
            UUID sellerOrderId,
            long amount,
            String currency,
            String reason) {
        jdbc.sql(INSERT)
                .param("id", id)
                .param("refundNo", refundNo)
                .param("paymentId", paymentId)
                .param("orderGroupId", orderGroupId)
                .param("sellerOrderId", sellerOrderId)
                .param("amount", amount)
                .param("currency", currency)
                .param("reason", reason)
                .update();
    }

    public Optional<RefundRow> findByBiz(UUID paymentId, UUID sellerOrderId, String reason) {
        return jdbc.sql(FIND_BY_BIZ)
                .param("paymentId", paymentId)
                .param("sellerOrderId", sellerOrderId)
                .param("reason", reason)
                .query(MAPPER)
                .optional();
    }

    /** false = 已经不是 pending（并发下另一个消费者先退了）。 */
    public java.util.Optional<RefundRow> findBySuspenseReason(UUID paymentId, String reason) {
        return jdbc.sql(FIND_BY_SUSPENSE_REASON)
                .param("paymentId", paymentId)
                .param("reason", reason)
                .query(MAPPER)
                .optional();
    }

    public boolean markSuccess(UUID id, String channelRefundId) {
        return jdbc.sql(MARK_SUCCESS)
                        .param("id", id)
                        .param("channelRefundId", channelRefundId)
                        .update()
                == 1;
    }

    /** 渠道没受理的退款单，按创建时间挑出够老的、还没超重试上限的。 */
    public List<RefundRow> findStalePending(java.time.Instant olderThan, int limit, int maxAttempts) {
        return jdbc.sql(FIND_STALE_PENDING)
                .param("olderThan", RowMappers.toDb(olderThan))
                .param("limit", limit)
                .param("maxAttempts", maxAttempts)
                .query(MAPPER)
                .list();
    }

    /** 尝试次数 +1，返回新值。超上限的判断交给调用方，这里不藏策略。 */
    public int incrementAttempts(UUID id) {
        return jdbc.sql(INCREMENT_ATTEMPTS).param("id", id).query(Integer.class).single();
    }

    public record RefundRow(
            UUID id,
            String refundNo,
            UUID paymentId,
            UUID orderGroupId,
            UUID sellerOrderId,
            long amount,
            String currency,
            String reason,
            String status,
            String channelRefundId,
            int attempts,
            java.time.Instant createdAt) {}
}
