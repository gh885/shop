package com.shop.platform.clearing.mapper;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 结算三张表的 SQL：待结算明细、批次、打款单。
 *
 * <p>金额一个都不在这里算——{@code net_amount} 有库约束 {@code ck_item_net} 兜着，
 * 批次金额由 {@code PostingService} 汇总，这里只负责搬。
 */
@Mapper
public interface SettlementMapper {

    @Insert(
            """
            INSERT INTO clearing.settlement_item
                (seller_order_id, merchant_id, currency, goods_amount, payable_amount,
                 commission_amount, net_amount)
            VALUES (#{sellerOrderId}, #{merchantId}, #{currency}, #{goodsAmount}, #{payableAmount},
                    #{commissionAmount}, #{netAmount})
            ON CONFLICT (seller_order_id) DO NOTHING
            """)
    void insertItem(
            @Param("sellerOrderId") UUID sellerOrderId,
            @Param("merchantId") UUID merchantId,
            @Param("currency") String currency,
            @Param("goodsAmount") long goodsAmount,
            @Param("payableAmount") long payableAmount,
            @Param("commissionAmount") long commissionAmount,
            @Param("netAmount") long netAmount);

    /** false = 已经不是 pending（重复事件、或已被别处推进）。 */
    @Update(
            """
            UPDATE clearing.settlement_item
               SET status = 'released', released_at = now()
             WHERE seller_order_id = #{sellerOrderId} AND status = 'pending'
            """)
    boolean release(@Param("sellerOrderId") UUID sellerOrderId);

    @Update("UPDATE clearing.settlement_item SET refunded_amount = refunded_amount + #{amount}"
            + " WHERE seller_order_id = #{sellerOrderId}")
    void addRefunded(@Param("sellerOrderId") UUID sellerOrderId, @Param("amount") long amount);

    @Select(
            """
            SELECT seller_order_id, merchant_id, currency, payable_amount, commission_amount, net_amount,
                   refunded_amount, status
              FROM clearing.settlement_item
             WHERE seller_order_id = #{sellerOrderId}
            """)
    Optional<ItemDetail> findItem(@Param("sellerOrderId") UUID sellerOrderId);

    /**
     * 已解冻、过了账期、还没进批次、且没有未终态售后——四条缺一不可。
     *
     * <p>最后一条是关键：钱被冻在 {@code frozen} 里，结算就不该碰它。
     * 只把余额挪走是不够的——批次金额是从明细算的，不看余额。
     */
    @Select(
            """
            SELECT DISTINCT i.merchant_id, i.currency
              FROM clearing.settlement_item i
             WHERE i.status = 'released' AND i.released_at <= #{before}
               AND NOT EXISTS (SELECT 1 FROM clearing.freeze_item f
                                WHERE f.seller_order_id = i.seller_order_id AND f.status = 'frozen')
            """)
    List<MerchantDue> dueMerchants(@Param("before") Instant before);

    /**
     * 认领即加锁：{@code FOR UPDATE SKIP LOCKED} 让这条 SELECT 同时是"圈定行集"和"互斥认领"——
     * 行锁持到本商家事务结束，另一个实例的 SELECT 会直接跳过这些行（拿到空列表就走人），
     * 不会出现两个实例给同一批明细各算一笔打款。多实例没有全局调度锁时这是最后一道闸。
     */
    @Select(
            """
            SELECT i.seller_order_id, i.payable_amount, i.net_amount, i.refunded_amount
              FROM clearing.settlement_item i
             WHERE i.status = 'released' AND i.released_at <= #{before}
               AND i.merchant_id = #{merchantId} AND i.currency = #{currency}
               AND NOT EXISTS (SELECT 1 FROM clearing.freeze_item f
                                WHERE f.seller_order_id = i.seller_order_id AND f.status = 'frozen')
             ORDER BY i.released_at
             FOR UPDATE OF i SKIP LOCKED
            """)
    List<ItemRow> dueItems(
            @Param("merchantId") UUID merchantId, @Param("currency") String currency, @Param("before") Instant before);

    @Insert(
            """
            INSERT INTO clearing.settlement_batch
                (id, batch_no, merchant_id, currency, item_count, gross_amount, refund_amount,
                 net_amount, status, period_start, period_end)
            VALUES (#{id}, #{batchNo}, #{merchantId}, #{currency}, #{itemCount}, #{grossAmount}, #{refundAmount},
                    #{netAmount}, 'closed', #{periodStart}, #{periodEnd})
            """)
    void insertBatch(
            @Param("id") UUID id,
            @Param("batchNo") String batchNo,
            @Param("merchantId") UUID merchantId,
            @Param("currency") String currency,
            @Param("itemCount") int itemCount,
            @Param("grossAmount") long grossAmount,
            @Param("refundAmount") long refundAmount,
            @Param("netAmount") long netAmount,
            @Param("periodStart") LocalDate periodStart,
            @Param("periodEnd") LocalDate periodEnd);

    @Insert(
            """
            INSERT INTO clearing.payout (id, payout_no, batch_id, merchant_id, amount, currency, channel)
            VALUES (#{id}, #{payoutNo}, #{batchId}, #{merchantId}, #{amount}, #{currency}, #{channel})
            """)
    void insertPayout(
            @Param("id") UUID id,
            @Param("payoutNo") String payoutNo,
            @Param("batchId") UUID batchId,
            @Param("merchantId") UUID merchantId,
            @Param("amount") long amount,
            @Param("currency") String currency,
            @Param("channel") String channel);

    @Update(
            """
            UPDATE clearing.payout
               SET status = 'success', channel_txn_id = #{txnId}, completed_at = now()
             WHERE id = #{id} AND status = 'submitted'
            """)
    boolean markPayoutSuccess(@Param("id") UUID id, @Param("txnId") String channelTxnId);

    @Update("UPDATE clearing.settlement_batch SET status = 'paid', paid_at = now() WHERE id = #{id}")
    void markBatchPaid(@Param("id") UUID id);

    /**
     * 落库按认领时拿到的 id 集合更新，**不重跑谓词**。
     *
     * <p>以前这里重新执行一遍和 {@code dueItems} 相同的 WHERE，READ COMMITTED 下两条语句各取快照，
     * 中间released 的明细会被 UPDATE 扫进去但不在批次金额里——批次金额和实际结算的明细对不上。
     */
    @Update(
            """
            <script>
            UPDATE clearing.settlement_item
               SET status = 'settled', batch_id = #{batchId}, settled_at = now()
             WHERE seller_order_id IN
            <foreach collection="sellerOrderIds" item="id" open="(" separator="," close=")">#{id}</foreach>
               AND status = 'released'
            </script>
            """)
    int settleItems(@Param("batchId") UUID batchId, @Param("sellerOrderIds") List<UUID> sellerOrderIds);

    record MerchantDue(UUID merchantId, String currency) {}

    record ItemRow(UUID sellerOrderId, long payableAmount, long netAmount, long refundedAmount) {}

    record ItemDetail(
            UUID sellerOrderId,
            UUID merchantId,
            String currency,
            long payableAmount,
            long commissionAmount,
            long netAmount,
            long refundedAmount,
            String status) {}
}
