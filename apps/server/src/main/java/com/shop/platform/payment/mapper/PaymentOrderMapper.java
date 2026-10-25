package com.shop.platform.payment.mapper;

import com.shop.platform.payment.model.PaymentStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * {@code payment_order} 的写入与状态迁移。
 *
 * <p><b>所有状态迁移都是条件更新。</b> 影响 0 行不是异常，是判决：这单已经被别的回调推进了，或者已经超时关了。
 */
@Mapper
public interface PaymentOrderMapper {

    String COLUMNS = "id, payment_no, buyer_id, order_group_id, channel, out_trade_no, amount, expected_amount, "
            + "currency, status, amount_matched, channel_txn_id, paid_at, closed_at, expires_at";

    @Insert(
            """
            INSERT INTO payment.payment_order
                (id, payment_no, buyer_id, order_group_id, channel, out_trade_no,
                 amount, expected_amount, currency, expires_at)
            VALUES (#{row.id}, #{row.paymentNo}, #{row.buyerId}, #{row.orderGroupId}, #{row.channel}, #{row.outTradeNo},
                    #{row.amount}, #{row.expectedAmount}, #{row.currency}, #{row.expiresAt})
            """)
    void insert(@Param("row") NewPayment payment);

    @Select("SELECT " + COLUMNS + " FROM payment.payment_order WHERE id = #{id}")
    Optional<PaymentRow> find(@Param("id") UUID id);

    @Select("SELECT " + COLUMNS + " FROM payment.payment_order WHERE out_trade_no = #{outTradeNo}")
    Optional<PaymentRow> findByOutTradeNo(@Param("outTradeNo") String outTradeNo);

    @Select("SELECT " + COLUMNS + " FROM payment.payment_order WHERE order_group_id = #{groupId} ORDER BY created_at")
    List<PaymentRow> findByGroup(@Param("groupId") UUID groupId);

    /**
     * 回调置成功。前置条件 {@code status = 'pending'} 就是幂等闸门：
     * 重放的回调影响 0 行，直接跳过。false = 不是 pending 了（已成功、已关、或重复回调）。
     */
    @Update(
            """
            UPDATE payment.payment_order
               SET status = 'success', paid_at = now(), amount_matched = #{amountMatched},
                   channel_txn_id = #{channelTxnId},
                   channel_payload = CAST(#{payload} AS jsonb)
             WHERE id = #{id} AND status = 'pending'
            """)
    boolean markSuccess(
            @Param("id") UUID id,
            @Param("amountMatched") boolean amountMatched,
            @Param("channelTxnId") String channelTxnId,
            @Param("payload") String payloadJson);

    @Update(
            """
            UPDATE payment.payment_order
               SET status = 'failed', channel_payload = CAST(#{payload} AS jsonb)
             WHERE id = #{id} AND status = 'pending'
            """)
    boolean markFailed(@Param("id") UUID id, @Param("payload") String payloadJson);

    /** 超时关单。与回调共用一个前置条件：谁改到行谁赢。 */
    /**
     * 超时关单批量化：一条语句圈定（SKIP LOCKED 防多实例互抢）并关闭。
     *
     * <p>以前是"先查 500 条、再逐条 UPDATE"，500 个来回全在一个事务里。
     * 关单本来就是纯条件更新，一条 SQL 完成且保留同样的幂等语义——
     * 里层 SELECT 的 FOR UPDATE 会挡住并发回调同时改这些行。
     */
    @Update(
            """
            UPDATE payment.payment_order
               SET status = 'closed', closed_at = now()
             WHERE id IN (SELECT id FROM payment.payment_order
                           WHERE status = 'pending' AND expires_at < now()
                           ORDER BY expires_at
                           LIMIT #{limit}
                           FOR UPDATE SKIP LOCKED)
            """)
    int closeExpiredBatch(@Param("limit") int limit);

    public record NewPayment(
            UUID id,
            String paymentNo,
            UUID buyerId,
            UUID orderGroupId,
            String channel,
            String outTradeNo,
            long amount,
            long expectedAmount,
            String currency,
            Instant expiresAt) {}

    public record PaymentRow(
            UUID id,
            String paymentNo,
            UUID buyerId,
            UUID orderGroupId,
            String channel,
            String outTradeNo,
            long amount,
            long expectedAmount,
            String currency,
            PaymentStatus status,
            Boolean amountMatched,
            String channelTxnId,
            Instant paidAt,
            Instant closedAt,
            Instant expiresAt) {}
}
