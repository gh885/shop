package com.shop.platform.payment.mapper;

import com.shop.platform.infra.db.RowMappers;
import com.shop.platform.payment.api.SuspenseReason;
import com.shop.platform.payment.internal.PaymentChannel;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * {@code payment.suspense_entry} 的写入与查询。"钱到了但推进不了"的统一台账，
 * 替换之前三处各写各的日志——日志是没人会去看的东西。
 *
 * <p><b>同一件事只挂一条</b>：{@code (payment_id, reason)} 唯一索引 + ON CONFLICT DO NOTHING。
 * 渠道重投回调、事件重放，都不该把同一笔钱挂两次。
 */
@Component
public class SuspenseStore {

    private static final String INSERT =
            """
            INSERT INTO payment.suspense_entry
                (payment_id, order_group_id, reason, channel, channel_txn_id,
                 amount, currency, raw_payload)
            VALUES (:paymentId, :orderGroupId, :reason, :channel, :channelTxnId,
                    :amount, :currency, CAST(:rawPayload AS jsonb))
            ON CONFLICT (payment_id, reason) DO NOTHING
            """;

    private static final String COLUMNS =
            "id, payment_id, order_group_id, reason, channel, channel_txn_id, amount, currency, "
                    + "status, resolution, note, created_at, resolved_at";

    private static final String FIND =
            """
            SELECT %s FROM payment.suspense_entry WHERE id = :id
            """.formatted(COLUMNS);

    /** 清单：open 在前（先处理），组内新的在前。 */
    private static final String LIST =
            """
            SELECT %s FROM payment.suspense_entry
             ORDER BY (status = 'open') DESC, created_at DESC
             LIMIT 200
            """
                    .formatted(COLUMNS);

    private static final String RESOLVE =
            """
            UPDATE payment.suspense_entry
               SET status = 'resolved', resolution = :resolution, resolved_at = now(), note = :note
             WHERE id = :id AND status = 'open'
            """;

    /** 退款成功后按支付单销账。一张支付单最多挂一条（三原因互斥），open 的全销。 */
    private static final String RESOLVE_BY_PAYMENT =
            """
            UPDATE payment.suspense_entry
               SET status = 'resolved', resolution = 'refunded', resolved_at = now()
             WHERE payment_id = :paymentId AND status = 'open'
            """;

    private static final RowMapper<SuspenseRow> MAPPER = RowMappers.of(SuspenseRow.class);

    private final JdbcClient jdbc;

    public SuspenseStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /** 回调路径的登记：渠道报的事实（金额、流水号、原始报文）就是证据，原样落。 */
    public void insert(
            SuspenseReason reason, PaymentOrderStore.PaymentRow payment, PaymentChannel.CallbackResult result) {
        insert(new NewSuspense(
                payment.id(),
                payment.orderGroupId(),
                reason,
                payment.channel(),
                result.channelTxnId(),
                result.amount(),
                payment.currency(),
                result.rawPayload()));
    }

    /** 命令路径的登记（trade 输掉竞态后调）：报文没有，支付单上的渠道流水号就是证据。 */
    public void insert(SuspenseReason reason, PaymentOrderStore.PaymentRow payment, long amount, String currency) {
        insert(new NewSuspense(
                payment.id(),
                payment.orderGroupId(),
                reason,
                payment.channel(),
                payment.channelTxnId(),
                amount,
                currency,
                null));
    }

    public void insert(NewSuspense entry) {
        // 主键由库的 uuidv7 默认值生成；调用方不关心挂账行的 id，只关心"挂上了"
        jdbc.sql(INSERT)
                .param("paymentId", entry.paymentId())
                .param("orderGroupId", entry.orderGroupId())
                .param("reason", entry.reason().dbValue())
                .param("channel", entry.channel())
                .param("channelTxnId", entry.channelTxnId())
                .param("amount", entry.amount())
                .param("currency", entry.currency())
                .param("rawPayload", entry.rawPayload())
                .update();
    }

    public java.util.Optional<SuspenseRow> find(UUID id) {
        return jdbc.sql(FIND).param("id", id).query(MAPPER).optional();
    }

    public List<SuspenseRow> list() {
        return jdbc.sql(LIST).query(MAPPER).list();
    }

    /** false = 不是 open（已销账或不存在），调用方据此 409。 */
    public boolean resolve(UUID id, String resolution, String note) {
        return jdbc.sql(RESOLVE)
                        .param("resolution", resolution)
                        .param("note", note)
                        .param("id", id)
                        .update()
                == 1;
    }

    public int resolveRefundedByPayment(UUID paymentId) {
        return jdbc.sql(RESOLVE_BY_PAYMENT).param("paymentId", paymentId).update();
    }

    public record NewSuspense(
            UUID paymentId,
            UUID orderGroupId,
            SuspenseReason reason,
            String channel,
            String channelTxnId,
            long amount,
            String currency,
            String rawPayload) {}

    public record SuspenseRow(
            UUID id,
            UUID paymentId,
            UUID orderGroupId,
            SuspenseReason reason,
            String channel,
            String channelTxnId,
            long amount,
            String currency,
            String status,
            String resolution,
            String note,
            java.time.Instant createdAt,
            java.time.Instant resolvedAt) {}
}
