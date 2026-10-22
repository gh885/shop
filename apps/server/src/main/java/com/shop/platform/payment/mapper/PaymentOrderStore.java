package com.shop.platform.payment.mapper;

import com.shop.platform.payment.model.PaymentStatus;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

/**
 * {@code payment_order} 的写入与状态迁移。
 *
 * <p><b>所有状态迁移都是条件更新。</b> 影响 0 行不是异常，是判决：这单已经被别的回调推进了，或者已经超时关了。
 */
@Component
public class PaymentOrderStore {

    private static final String INSERT =
            """
            INSERT INTO payment.payment_order
                (id, pay_no, buyer_id, order_group_id, channel, out_trade_no,
                 amount, expected_amount, currency, expire_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """;

    private static final String COLUMNS =
            "id, pay_no, buyer_id, order_group_id, channel, out_trade_no, amount, expected_amount, "
                    + "currency, status, matched, channel_txn_id, paid_at, closed_at, expire_at";

    private static final String FIND =
            """
            SELECT %s FROM payment.payment_order WHERE id = ?
            """.formatted(COLUMNS);

    private static final String FIND_BY_OUT_TRADE_NO =
            """
            SELECT %s FROM payment.payment_order WHERE out_trade_no = ?
            """
                    .formatted(COLUMNS);

    private static final String FIND_BY_GROUP =
            """
            SELECT %s FROM payment.payment_order WHERE order_group_id = ? ORDER BY created_at
            """
                    .formatted(COLUMNS);

    /**
     * 回调置成功。前置条件 {@code status = 'pending'} 就是幂等闸门：
     * 重放的回调影响 0 行，直接跳过。
     */
    private static final String MARK_SUCCESS =
            """
            UPDATE payment.payment_order
               SET status = 'success', paid_at = now(), matched = ?, channel_txn_id = ?, channel_payload = ?::jsonb
             WHERE id = ? AND status = 'pending'
            """;

    private static final String MARK_FAILED =
            """
            UPDATE payment.payment_order
               SET status = 'failed', channel_payload = ?::jsonb
             WHERE id = ? AND status = 'pending'
            """;

    /** 超时关单。与回调共用一个前置条件：谁改到行谁赢。 */
    private static final String MARK_CLOSED =
            """
            UPDATE payment.payment_order
               SET status = 'closed', closed_at = now()
             WHERE id = ? AND status = 'pending'
            """;

    private static final String FIND_EXPIRABLE =
            """
            SELECT %s FROM payment.payment_order
             WHERE status = 'pending' AND expire_at < now()
             ORDER BY expire_at
             LIMIT ?
            """
                    .formatted(COLUMNS);

    private static final RowMapper<PaymentRow> MAPPER = (rs, row) -> new PaymentRow(
            rs.getObject("id", UUID.class),
            rs.getString("pay_no"),
            rs.getObject("buyer_id", UUID.class),
            rs.getObject("order_group_id", UUID.class),
            rs.getString("channel"),
            rs.getString("out_trade_no"),
            rs.getLong("amount"),
            rs.getLong("expected_amount"),
            rs.getString("currency"),
            PaymentStatus.from(rs.getString("status")),
            (Boolean) rs.getObject("matched"),
            rs.getString("channel_txn_id"),
            rs.getTimestamp("paid_at") == null
                    ? null
                    : rs.getTimestamp("paid_at").toInstant(),
            rs.getTimestamp("closed_at") == null
                    ? null
                    : rs.getTimestamp("closed_at").toInstant(),
            rs.getTimestamp("expire_at").toInstant());

    private final JdbcTemplate jdbc;

    public PaymentOrderStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void insert(NewPayment payment) {
        jdbc.update(
                INSERT,
                payment.id(),
                payment.payNo(),
                payment.buyerId(),
                payment.orderGroupId(),
                payment.channel(),
                payment.outTradeNo(),
                payment.amount(),
                payment.expectedAmount(),
                payment.currency(),
                java.sql.Timestamp.from(payment.expireAt()));
    }

    public Optional<PaymentRow> find(UUID id) {
        return jdbc.query(FIND, MAPPER, id).stream().findFirst();
    }

    public Optional<PaymentRow> findByOutTradeNo(String outTradeNo) {
        return jdbc.query(FIND_BY_OUT_TRADE_NO, MAPPER, outTradeNo).stream().findFirst();
    }

    public List<PaymentRow> findByGroup(UUID groupId) {
        return jdbc.query(FIND_BY_GROUP, MAPPER, groupId);
    }

    /** false = 不是 pending 了（已成功、已关、或重复回调）。 */
    public boolean markSuccess(UUID id, boolean matched, String channelTxnId, String payloadJson) {
        return jdbc.update(MARK_SUCCESS, matched, channelTxnId, payloadJson, id) == 1;
    }

    public boolean markFailed(UUID id, String payloadJson) {
        return jdbc.update(MARK_FAILED, payloadJson, id) == 1;
    }

    public boolean markClosed(UUID id) {
        return jdbc.update(MARK_CLOSED, id) == 1;
    }

    public List<PaymentRow> findExpired(int limit) {
        return jdbc.query(FIND_EXPIRABLE, MAPPER, limit);
    }

    public record NewPayment(
            UUID id,
            String payNo,
            UUID buyerId,
            UUID orderGroupId,
            String channel,
            String outTradeNo,
            long amount,
            long expectedAmount,
            String currency,
            Instant expireAt) {}

    public record PaymentRow(
            UUID id,
            String payNo,
            UUID buyerId,
            UUID orderGroupId,
            String channel,
            String outTradeNo,
            long amount,
            long expectedAmount,
            String currency,
            PaymentStatus status,
            Boolean matched,
            String channelTxnId,
            Instant paidAt,
            Instant closedAt,
            Instant expireAt) {}
}
