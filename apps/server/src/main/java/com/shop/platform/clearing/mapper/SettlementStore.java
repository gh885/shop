package com.shop.platform.clearing.mapper;

import com.shop.platform.infra.db.RowMappers;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 结算三张表的 SQL：待结算明细、批次、打款单。
 *
 * <p>金额一个都不在这里算——{@code net_amount} 有库约束 {@code ck_item_net} 兜着，
 * 批次金额由 {@code PostingService} 汇总，这里只负责搬。
 */
@Component
public class SettlementStore {

    private static final String INSERT_ITEM =
            """
            INSERT INTO clearing.settlement_item
                (seller_order_id, merchant_id, currency, goods_amount, payable_amount,
                 commission_amount, net_amount)
            VALUES (:sellerOrderId, :merchantId, :currency, :goodsAmount, :payableAmount,
                    :commissionAmount, :netAmount)
            ON CONFLICT (seller_order_id) DO NOTHING
            """;

    private static final String RELEASE_ITEM =
            """
            UPDATE clearing.settlement_item
               SET status = 'released', released_at = now()
             WHERE seller_order_id = :sellerOrderId AND status = 'pending'
            """;

    private static final String FIND_ITEM =
            """
            SELECT seller_order_id, merchant_id, currency, payable_amount, commission_amount, net_amount,
                   refunded_amount, status
              FROM clearing.settlement_item
             WHERE seller_order_id = :sellerOrderId
            """;

    private static final String ADD_REFUNDED =
            "UPDATE clearing.settlement_item SET refunded_amount = refunded_amount + :amount"
                    + " WHERE seller_order_id = :sellerOrderId";

    /** 已解冻、过了账期、还没进批次——这三条缺一不可，否则会提前结或重复结。 */
    private static final String DUE_MERCHANTS =
            """
            SELECT DISTINCT merchant_id, currency
              FROM clearing.settlement_item
             WHERE status = 'released' AND released_at <= :before
            """;

    private static final String DUE_ITEMS =
            """
            SELECT seller_order_id, net_amount, refunded_amount
              FROM clearing.settlement_item
             WHERE status = 'released' AND released_at <= :before
               AND merchant_id = :merchantId AND currency = :currency
             ORDER BY released_at
            """;

    private static final String INSERT_BATCH =
            """
            INSERT INTO clearing.settlement_batch
                (id, batch_no, merchant_id, currency, item_count, gross_amount, refund_amount,
                 net_amount, status, period_start, period_end)
            VALUES (:id, :batchNo, :merchantId, :currency, :itemCount, :grossAmount, :refundAmount,
                    :netAmount, 'closed', :periodStart, :periodEnd)
            """;

    private static final String INSERT_PAYOUT =
            """
            INSERT INTO clearing.payout (id, payout_no, batch_id, merchant_id, amount, currency, channel)
            VALUES (:id, :payoutNo, :batchId, :merchantId, :amount, :currency, :channel)
            """;

    private static final String PAYOUT_SUCCESS =
            """
            UPDATE clearing.payout
               SET status = 'success', channel_txn_id = :txnId, completed_at = now()
             WHERE id = :id AND status = 'submitted'
            """;

    private static final String BATCH_PAID =
            "UPDATE clearing.settlement_batch SET status = 'paid', paid_at = now() WHERE id = :id";

    private static final String SETTLE_ITEMS =
            """
            UPDATE clearing.settlement_item
               SET status = 'settled', batch_id = :batchId, settled_at = now()
             WHERE status = 'released' AND merchant_id = :merchantId AND currency = :currency
               AND released_at <= :before
            """;

    private static final RowMapper<ItemRow> ITEM_MAPPER = RowMappers.of(ItemRow.class);

    private final JdbcClient jdbc;

    public SettlementStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void insertItem(
            UUID sellerOrderId,
            UUID merchantId,
            String currency,
            long goodsAmount,
            long payableAmount,
            long commissionAmount,
            long netAmount) {
        jdbc.sql(INSERT_ITEM)
                .param("sellerOrderId", sellerOrderId)
                .param("merchantId", merchantId)
                .param("currency", currency)
                .param("goodsAmount", goodsAmount)
                .param("payableAmount", payableAmount)
                .param("commissionAmount", commissionAmount)
                .param("netAmount", netAmount)
                .update();
    }

    /** false = 已经不是 pending（重复事件、或已被别处推进）。 */
    public boolean release(UUID sellerOrderId) {
        return jdbc.sql(RELEASE_ITEM).param("sellerOrderId", sellerOrderId).update() == 1;
    }

    public void addRefunded(UUID sellerOrderId, long amount) {
        jdbc.sql(ADD_REFUNDED)
                .param("sellerOrderId", sellerOrderId)
                .param("amount", amount)
                .update();
    }

    public java.util.Optional<ItemDetail> findItem(UUID sellerOrderId) {
        return jdbc.sql(FIND_ITEM)
                .param("sellerOrderId", sellerOrderId)
                .query(RowMappers.of(ItemDetail.class))
                .optional();
    }

    public List<MerchantDue> dueMerchants(Instant before) {
        return jdbc.sql(DUE_MERCHANTS)
                .param("before", RowMappers.toDb(before))
                .query((rs, row) -> new MerchantDue(rs.getObject("merchant_id", UUID.class), rs.getString("currency")))
                .list();
    }

    public List<ItemRow> dueItems(UUID merchantId, String currency, Instant before) {
        return jdbc.sql(DUE_ITEMS)
                .param("merchantId", merchantId)
                .param("currency", currency)
                .param("before", RowMappers.toDb(before))
                .query(ITEM_MAPPER)
                .list();
    }

    public void insertBatch(
            UUID id,
            String batchNo,
            UUID merchantId,
            String currency,
            int itemCount,
            long grossAmount,
            long refundAmount,
            long netAmount,
            java.time.LocalDate periodStart,
            java.time.LocalDate periodEnd) {
        jdbc.sql(INSERT_BATCH)
                .param("id", id)
                .param("batchNo", batchNo)
                .param("merchantId", merchantId)
                .param("currency", currency)
                .param("itemCount", itemCount)
                .param("grossAmount", grossAmount)
                .param("refundAmount", refundAmount)
                .param("netAmount", netAmount)
                .param("periodStart", periodStart)
                .param("periodEnd", periodEnd)
                .update();
    }

    public void insertPayout(
            UUID id, String payoutNo, UUID batchId, UUID merchantId, long amount, String currency, String channel) {
        jdbc.sql(INSERT_PAYOUT)
                .param("id", id)
                .param("payoutNo", payoutNo)
                .param("batchId", batchId)
                .param("merchantId", merchantId)
                .param("amount", amount)
                .param("currency", currency)
                .param("channel", channel)
                .update();
    }

    public boolean markPayoutSuccess(UUID id, String channelTxnId) {
        return jdbc.sql(PAYOUT_SUCCESS)
                        .param("id", id)
                        .param("txnId", channelTxnId)
                        .update()
                == 1;
    }

    public void markBatchPaid(UUID id) {
        jdbc.sql(BATCH_PAID).param("id", id).update();
    }

    public void settleItems(UUID batchId, UUID merchantId, String currency, Instant before) {
        jdbc.sql(SETTLE_ITEMS)
                .param("batchId", batchId)
                .param("merchantId", merchantId)
                .param("currency", currency)
                .param("before", RowMappers.toDb(before))
                .update();
    }

    public record MerchantDue(UUID merchantId, String currency) {}

    public record ItemRow(UUID sellerOrderId, long netAmount, long refundedAmount) {}

    public record ItemDetail(
            UUID sellerOrderId,
            UUID merchantId,
            String currency,
            long payableAmount,
            long commissionAmount,
            long netAmount,
            long refundedAmount,
            String status) {}
}
