package com.shop.platform.trade.mapper;

import com.shop.platform.infra.db.RowMappers;
import com.shop.platform.trade.model.CloseReason;
import com.shop.platform.trade.model.PaymentStatus;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
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
            VALUES (:id, :groupNo, :buyerId, :quoteId, :currency, :goodsAmount, :discountAmount,
                    :shippingAmount, :payableAmount, CAST(:shipAddress AS jsonb), :expireAt)
            """;

    private static final String COLUMNS =
            "id, group_no, buyer_id, quote_id, payment_status, closed_at, close_reason, currency, "
                    + "goods_amount, discount_amount, shipping_amount, payable_amount, paid_amount, "
                    + "refunded_amount, expire_at";

    private static final String FIND =
            """
            SELECT %s FROM trade.order_group WHERE id = :id
            """.formatted(COLUMNS);

    private static final String FIND_BY_QUOTE =
            """
            SELECT %s FROM trade.order_group WHERE quote_id = :quoteId
            """
                    .formatted(COLUMNS);

    /**
     * 超时关单。前置条件与支付回调**完全一样**，这就是胜负判决的地方。
     *
     * <p>不许把 {@code closed_at} 直接写上去而不看 {@code payment_status}：已付款的订单关闭只能走退款。
     */
    private static final String CLOSE =
            """
            UPDATE trade.order_group
               SET closed_at = now(), close_reason = :reason
             WHERE id = :id AND payment_status = 'unpaid' AND closed_at IS NULL
            """;

    /**
     * 支付成功。与超时关单同一前置条件，谁改到行谁赢。
     */
    private static final String MARK_PAID =
            """
            UPDATE trade.order_group
               SET payment_status = 'paid', paid_amount = :paidAmount, paid_at = now()
             WHERE id = :id AND payment_status = 'unpaid' AND closed_at IS NULL
            """;

    /** 超时任务扫描：只扫部分索引，分批。 */
    private static final String FIND_EXPIRABLE =
            """
            SELECT %s FROM trade.order_group
             WHERE payment_status = 'unpaid' AND closed_at IS NULL AND expire_at < now() - interval '5 minutes'
             ORDER BY expire_at
             LIMIT :limit
            """
                    .formatted(COLUMNS);

    private static final RowMapper<GroupRow> MAPPER = RowMappers.of(GroupRow.class);

    private final JdbcClient jdbc;

    public OrderGroupStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void insert(NewGroup group) {
        jdbc.sql(INSERT)
                .param("id", group.id())
                .param("groupNo", group.groupNo())
                .param("buyerId", group.buyerId())
                .param("quoteId", group.quoteId())
                .param("currency", group.currency())
                .param("goodsAmount", group.goodsAmount())
                .param("discountAmount", group.discountAmount())
                .param("shippingAmount", group.shippingAmount())
                .param("payableAmount", group.payableAmount())
                .param("shipAddress", group.shipAddressJson())
                .param("expireAt", RowMappers.toDb(group.expireAt()))
                .update();
    }

    public Optional<GroupRow> find(UUID id) {
        return jdbc.sql(FIND).param("id", id).query(MAPPER).optional();
    }

    public Optional<GroupRow> findByQuote(UUID quoteId) {
        return jdbc.sql(FIND_BY_QUOTE).param("quoteId", quoteId).query(MAPPER).optional();
    }

    /** false = 已经被支付回调抢先；这单不该关。 */
    public boolean close(UUID id, CloseReason reason) {
        return jdbc.sql(CLOSE).param("reason", reason.dbValue()).param("id", id).update() == 1;
    }

    /** false = 已经被超时任务抢先；调用方必须据此发起退款，不能当"已处理"。 */
    public boolean markPaid(UUID id, long paidAmount) {
        return jdbc.sql(MARK_PAID)
                        .param("paidAmount", paidAmount)
                        .param("id", id)
                        .update()
                == 1;
    }

    public List<GroupRow> findExpired(int limit) {
        return jdbc.sql(FIND_EXPIRABLE).param("limit", limit).query(MAPPER).list();
    }

    /**
     * 加已退金额，并同步支付状态。
     *
     * <p>状态是<b>算出来的</b>，不是调用方传的：{@code refunded >= paid} 就是全额退完。
     * 让调用方传状态，等于允许它写一个和金额对不上的状态。
     */
    private static final String ADD_REFUNDED =
            """
            UPDATE trade.order_group
               SET refunded_amount = refunded_amount + :amount,
                   payment_status = CASE WHEN refunded_amount + :amount >= paid_amount
                                         THEN 'refunded' ELSE 'partially_refunded' END
             WHERE id = :id AND refunded_amount + :amount <= paid_amount
            """;

    /** false = 退超了实收金额，什么都没改。 */
    public boolean addRefunded(UUID id, long amount) {
        return jdbc.sql(ADD_REFUNDED).param("id", id).param("amount", amount).update() == 1;
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
            Instant expireAt) {}

    public record GroupRow(
            UUID id,
            String groupNo,
            UUID buyerId,
            UUID quoteId,
            PaymentStatus paymentStatus,
            Instant closedAt,
            CloseReason closeReason,
            String currency,
            long goodsAmount,
            long discountAmount,
            long shippingAmount,
            long payableAmount,
            long paidAmount,
            long refundedAmount,
            Instant expireAt) {

        public boolean isOpen() {
            return closedAt == null;
        }
    }
}
