package com.shop.platform.trade.mapper;

import com.shop.platform.trade.model.CloseReason;
import com.shop.platform.trade.model.PaymentStatus;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

/**
 * {@code order_group} 的写入与状态迁移。
 *
 * <p><b>所有状态迁移都是条件更新，没有一条是"先查后改"。</b> 影响 0 行就是别人先动了，
 * 调用方必须把它当判决结果，不能当异常吞掉。
 */
@Component
public class OrderGroupStore {

    private static final String INSERT =
            """
            INSERT INTO trade.order_group
                (id, group_no, buyer_id, quote_id, currency, goods_amount, discount_amount,
                 shipping_amount, payable_amount, ship_address, expire_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)
            """;

    private static final String COLUMNS =
            "id, group_no, buyer_id, quote_id, payment_status, closed_at, close_reason, currency, "
                    + "goods_amount, discount_amount, shipping_amount, payable_amount, paid_amount, "
                    + "refunded_amount, expire_at";

    private static final String FIND =
            """
            SELECT %s FROM trade.order_group WHERE id = ?
            """.formatted(COLUMNS);

    private static final String FIND_BY_QUOTE =
            """
            SELECT %s FROM trade.order_group WHERE quote_id = ?
            """.formatted(COLUMNS);

    /**
     * 超时关单。前置条件与支付回调**完全一样**，这就是胜负判决的地方。
     *
     * <p>不许把 {@code closed_at} 直接写上去而不看 {@code payment_status}：已付款的订单关闭只能走退款。
     */
    private static final String CLOSE =
            """
            UPDATE trade.order_group
               SET closed_at = now(), close_reason = ?
             WHERE id = ? AND payment_status = 'unpaid' AND closed_at IS NULL
            """;

    /**
     * 支付成功。与超时关单同一前置条件，谁改到行谁赢。
     */
    private static final String MARK_PAID =
            """
            UPDATE trade.order_group
               SET payment_status = 'paid', paid_amount = ?, paid_at = now()
             WHERE id = ? AND payment_status = 'unpaid' AND closed_at IS NULL
            """;

    /** 超时任务扫描：只扫部分索引，分批。 */
    private static final String FIND_EXPIRABLE =
            """
            SELECT %s FROM trade.order_group
             WHERE payment_status = 'unpaid' AND closed_at IS NULL AND expire_at < now() - interval '5 minutes'
             ORDER BY expire_at
             LIMIT ?
            """
                    .formatted(COLUMNS);

    private static final RowMapper<GroupRow> MAPPER = (rs, row) -> new GroupRow(
            rs.getObject("id", UUID.class),
            rs.getString("group_no"),
            rs.getObject("buyer_id", UUID.class),
            rs.getObject("quote_id", UUID.class),
            PaymentStatus.from(rs.getString("payment_status")),
            rs.getTimestamp("closed_at") == null
                    ? null
                    : rs.getTimestamp("closed_at").toInstant(),
            CloseReason.from(rs.getString("close_reason")),
            rs.getString("currency"),
            rs.getLong("goods_amount"),
            rs.getLong("discount_amount"),
            rs.getLong("shipping_amount"),
            rs.getLong("payable_amount"),
            rs.getLong("paid_amount"),
            rs.getLong("refunded_amount"),
            rs.getTimestamp("expire_at").toInstant());

    private final JdbcTemplate jdbc;

    public OrderGroupStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void insert(NewGroup group) {
        jdbc.update(
                INSERT,
                group.id(),
                group.groupNo(),
                group.buyerId(),
                group.quoteId(),
                group.currency(),
                group.goodsAmount(),
                group.discountAmount(),
                group.shippingAmount(),
                group.payableAmount(),
                group.shipAddressJson(),
                java.sql.Timestamp.from(group.expireAt()));
    }

    public Optional<GroupRow> find(UUID id) {
        return jdbc.query(FIND, MAPPER, id).stream().findFirst();
    }

    public Optional<GroupRow> findByQuote(UUID quoteId) {
        return jdbc.query(FIND_BY_QUOTE, MAPPER, quoteId).stream().findFirst();
    }

    /** false = 已经被支付回调抢先；这单不该关。 */
    public boolean close(UUID id, CloseReason reason) {
        return jdbc.update(CLOSE, reason.dbValue(), id) == 1;
    }

    /** false = 已经被超时任务抢先；调用方必须据此发起退款，不能当"已处理"。 */
    public boolean markPaid(UUID id, long paidAmount) {
        return jdbc.update(MARK_PAID, paidAmount, id) == 1;
    }

    public List<GroupRow> findExpired(int limit) {
        return jdbc.query(FIND_EXPIRABLE, MAPPER, limit);
    }

    public record NewGroup(
            UUID id,
            String groupNo,
            UUID buyerId,
            UUID quoteId,
            String currency,
            long goodsAmount,
            long discountAmount,
            long shippingAmount,
            long payableAmount,
            String shipAddressJson,
            java.time.Instant expireAt) {}

    public record GroupRow(
            UUID id,
            String groupNo,
            UUID buyerId,
            UUID quoteId,
            PaymentStatus paymentStatus,
            java.time.Instant closedAt,
            CloseReason closeReason,
            String currency,
            long goodsAmount,
            long discountAmount,
            long shippingAmount,
            long payableAmount,
            long paidAmount,
            long refundedAmount,
            java.time.Instant expireAt) {

        public boolean isOpen() {
            return closedAt == null;
        }
    }
}
