package com.shop.platform.payment.mapper;

import com.shop.platform.infra.db.RowMappers;
import com.shop.platform.payment.model.PaymentStatus;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
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
            VALUES (:id, :payNo, :buyerId, :orderGroupId, :channel, :outTradeNo,
                    :amount, :expectedAmount, :currency, :expireAt)
            """;

    private static final String COLUMNS =
            "id, pay_no, buyer_id, order_group_id, channel, out_trade_no, amount, expected_amount, "
                    + "currency, status, matched, channel_txn_id, paid_at, closed_at, expire_at";

    private static final String FIND =
            """
            SELECT %s FROM payment.payment_order WHERE id = :id
            """.formatted(COLUMNS);

    private static final String FIND_BY_OUT_TRADE_NO =
            """
            SELECT %s FROM payment.payment_order WHERE out_trade_no = :outTradeNo
            """
                    .formatted(COLUMNS);

    private static final String FIND_BY_GROUP =
            """
            SELECT %s FROM payment.payment_order WHERE order_group_id = :groupId ORDER BY created_at
            """
                    .formatted(COLUMNS);

    /**
     * 回调置成功。前置条件 {@code status = 'pending'} 就是幂等闸门：
     * 重放的回调影响 0 行，直接跳过。
     */
    private static final String MARK_SUCCESS =
            """
            UPDATE payment.payment_order
               SET status = 'success', paid_at = now(), matched = :matched,
                   channel_txn_id = :channelTxnId, channel_payload = CAST(:payload AS jsonb)
             WHERE id = :id AND status = 'pending'
            """;

    private static final String MARK_FAILED =
            """
            UPDATE payment.payment_order
               SET status = 'failed', channel_payload = CAST(:payload AS jsonb)
             WHERE id = :id AND status = 'pending'
            """;

    /** 超时关单。与回调共用一个前置条件：谁改到行谁赢。 */
    private static final String MARK_CLOSED =
            """
            UPDATE payment.payment_order
               SET status = 'closed', closed_at = now()
             WHERE id = :id AND status = 'pending'
            """;

    private static final String FIND_EXPIRABLE =
            """
            SELECT %s FROM payment.payment_order
             WHERE status = 'pending' AND expire_at < now()
             ORDER BY expire_at
             LIMIT :limit
            """
                    .formatted(COLUMNS);

    private static final RowMapper<PaymentRow> MAPPER = RowMappers.of(PaymentRow.class);

    private final JdbcClient jdbc;

    public PaymentOrderStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void insert(NewPayment payment) {
        jdbc.sql(INSERT)
                .param("id", payment.id())
                .param("payNo", payment.payNo())
                .param("buyerId", payment.buyerId())
                .param("orderGroupId", payment.orderGroupId())
                .param("channel", payment.channel())
                .param("outTradeNo", payment.outTradeNo())
                .param("amount", payment.amount())
                .param("expectedAmount", payment.expectedAmount())
                .param("currency", payment.currency())
                .param("expireAt", RowMappers.toDb(payment.expireAt()))
                .update();
    }

    public Optional<PaymentRow> find(UUID id) {
        return jdbc.sql(FIND).param("id", id).query(MAPPER).optional();
    }

    public Optional<PaymentRow> findByOutTradeNo(String outTradeNo) {
        return jdbc.sql(FIND_BY_OUT_TRADE_NO)
                .param("outTradeNo", outTradeNo)
                .query(MAPPER)
                .optional();
    }

    public List<PaymentRow> findByGroup(UUID groupId) {
        return jdbc.sql(FIND_BY_GROUP).param("groupId", groupId).query(MAPPER).list();
    }

    /** false = 不是 pending 了（已成功、已关、或重复回调）。 */
    public boolean markSuccess(UUID id, boolean matched, String channelTxnId, String payloadJson) {
        return jdbc.sql(MARK_SUCCESS)
                        .param("matched", matched)
                        .param("channelTxnId", channelTxnId)
                        .param("payload", payloadJson)
                        .param("id", id)
                        .update()
                == 1;
    }

    public boolean markFailed(UUID id, String payloadJson) {
        return jdbc.sql(MARK_FAILED)
                        .param("payload", payloadJson)
                        .param("id", id)
                        .update()
                == 1;
    }

    public boolean markClosed(UUID id) {
        return jdbc.sql(MARK_CLOSED).param("id", id).update() == 1;
    }

    public List<PaymentRow> findExpired(int limit) {
        return jdbc.sql(FIND_EXPIRABLE).param("limit", limit).query(MAPPER).list();
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
