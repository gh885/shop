package com.shop.platform.payment.mapper;

import com.shop.platform.infra.db.RowMappers;
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
            ON CONFLICT (payment_id, seller_order_id, reason) DO NOTHING
            """;

    private static final String FIND_BY_BIZ =
            """
            SELECT id, refund_no, payment_id, order_group_id, seller_order_id, amount, currency,
                   reason, status, channel_refund_id
              FROM payment.refund_order
             WHERE payment_id = :paymentId AND seller_order_id = :sellerOrderId AND reason = :reason
            """;

    private static final String MARK_SUCCESS =
            """
            UPDATE payment.refund_order
               SET status = 'success', channel_refund_id = :channelRefundId, completed_at = now()
             WHERE id = :id AND status = 'pending'
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
    public boolean markSuccess(UUID id, String channelRefundId) {
        return jdbc.sql(MARK_SUCCESS)
                        .param("id", id)
                        .param("channelRefundId", channelRefundId)
                        .update()
                == 1;
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
            String channelRefundId) {}
}
