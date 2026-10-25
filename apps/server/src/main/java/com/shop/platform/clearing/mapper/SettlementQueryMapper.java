package com.shop.platform.clearing.mapper;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 商家侧的结算查询。只读，不写。
 *
 * <p>和 {@link SettlementMapper} 分开：那个是结算任务的手，改状态、算到期；这个是商家后台的眼睛，
 * 只回答"我有多少钱、卡在哪一步"。合在一起会让"读"和"推进"共用一套 SQL，
 * 某天为了展示加一个 {@code OR}，结算任务就多结了一批。
 *
 * <p>三条查询都按 {@code merchant_id} 过滤，且<b>只认这一个条件</b>——
 * 归属判断不在这里做。把"能不能看"和"看什么"混在 SQL 里，漏一个条件就是越权。
 */
@Mapper
public interface SettlementQueryMapper {

    /**
     * 待结算明细。{@code status} 可空 = 全部。
     *
     * <p>不在这里算"可结多少"：那个数要把买家退款额换算成商家承担额，换算只有
     * {@code MerchantShare} 一份实现。SQL 里再写一遍，两处迟早对不上。
     *
     * @param status 可空；{@code pending}（待确认收货）/ {@code released}（可结算）/ {@code settled}（已结算）
     */
    @Select(
            """
            SELECT seller_order_id, currency, goods_amount, payable_amount, commission_amount,
                   net_amount, refunded_amount,
                   status, released_at, settled_at, batch_id, created_at
              FROM clearing.settlement_item
             WHERE merchant_id = #{merchantId}
               AND (CAST(#{status} AS text) IS NULL
                    OR status = CAST(#{status} AS text))
             ORDER BY created_at DESC
             LIMIT #{limit}
            """)
    List<ItemRow> items(
            @Param("merchantId") UUID merchantId, @Param("status") String status, @Param("limit") int limit);

    /**
     * 结算批次，带打款结果。
     *
     * <p>LEFT JOIN 而不是 INNER：{@code closed} 但还没出款的批次不该从列表里消失——
     * 商家看到的应该是"批次已生成、钱还没打"，而不是"什么都没有"。
     */
    @Select(
            """
            SELECT b.id, b.batch_no, b.currency, b.item_count, b.gross_amount, b.refund_amount,
                   b.net_amount, b.status, b.period_start, b.period_end, b.created_at, b.paid_at,
                   p.payout_no, p.status AS payout_status, p.channel, p.channel_txn_id, p.failure_reason
              FROM clearing.settlement_batch b
              LEFT JOIN clearing.payout p ON p.batch_id = b.id
             WHERE b.merchant_id = #{merchantId}
             ORDER BY b.created_at DESC
             LIMIT #{limit}
            """)
    List<BatchView> batches(@Param("merchantId") UUID merchantId, @Param("limit") int limit);

    /**
     * 一个子单的待结算明细。
     *
     * @param refundedAmount 买家累计退款（{@code payableAmount} 口径）。注意它<b>不是</b>商家承担的金额——
     *                       商家承担的是 {@code MerchantShare.of(refundedAmount, netAmount, payableAmount)}
     */
    record ItemRow(
            UUID sellerOrderId,
            String currency,
            long goodsAmount,
            long payableAmount,
            long commissionAmount,
            long netAmount,
            long refundedAmount,
            String status,
            Instant releasedAt,
            Instant settledAt,
            UUID batchId,
            Instant createdAt) {}

    /**
     * 一个结算批次 + 它的打款结果。
     *
     * @param status       批次状态：{@code closed} / {@code paying} / {@code paid} / {@code failed}
     * @param payoutStatus 打款单状态：{@code submitted} / {@code success} / {@code failed}；
     *                     {@code null} = 还没生成打款单
     * @param failureReason 渠道给的失败原因，只有 {@code failed} 时非空
     */
    record BatchView(
            UUID id,
            String batchNo,
            String currency,
            int itemCount,
            long grossAmount,
            long refundAmount,
            long netAmount,
            String status,
            LocalDate periodStart,
            LocalDate periodEnd,
            Instant createdAt,
            Instant paidAt,
            String payoutNo,
            String payoutStatus,
            String channel,
            String channelTxnId,
            String failureReason) {}
}
