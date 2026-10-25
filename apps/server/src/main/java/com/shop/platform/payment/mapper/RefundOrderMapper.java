package com.shop.platform.payment.mapper;

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
 * 退款单的读写。
 *
 * <p>幂等键是 {@code (payment_id, seller_order_id, reason)}，由表达式唯一索引
 * {@code uq_refund_suspense_biz} 兜——COALESCE 把挂账退款的 NULL 子单折成零 uuid，
 * NULL 也去重。同一个售后单重复发 {@code ReturnApproved}，第二发撞唯一键、什么都不做——
 * **不是靠代码判断"退过没有"**，那个判断在并发下一定会漏。
 */
@Mapper
public interface RefundOrderMapper {

    @Insert(
            """
            INSERT INTO payment.refund_order
                (id, refund_no, payment_id, order_group_id, seller_order_id, amount, currency, reason, status)
            VALUES (#{id}, #{refundNo}, #{paymentId}, #{orderGroupId}, #{sellerOrderId},
                    #{amount}, #{currency}, #{reason}, 'pending')
            ON CONFLICT (payment_id, COALESCE(seller_order_id, '00000000-0000-0000-0000-000000000000'::uuid), reason)
                DO NOTHING
            """)
    void insert(
            @Param("id") UUID id,
            @Param("refundNo") String refundNo,
            @Param("paymentId") UUID paymentId,
            @Param("orderGroupId") UUID orderGroupId,
            @Param("sellerOrderId") UUID sellerOrderId,
            @Param("amount") long amount,
            @Param("currency") String currency,
            @Param("reason") String reason);

    @Select(
            """
            SELECT id, refund_no, payment_id, order_group_id, seller_order_id, amount, currency,
                   reason, status, channel_refund_id, attempts, created_at
              FROM payment.refund_order
             WHERE payment_id = #{paymentId} AND seller_order_id = #{sellerOrderId} AND reason = #{reason}
            """)
    Optional<RefundRow> findByBiz(
            @Param("paymentId") UUID paymentId,
            @Param("sellerOrderId") UUID sellerOrderId,
            @Param("reason") String reason);

    /** 挂账退款不带子单：seller_order_id 为 NULL 时 = 比较永远不成立，必须用 IS NULL。 */
    @Select(
            """
            SELECT id, refund_no, payment_id, order_group_id, seller_order_id, amount, currency,
                   reason, status, channel_refund_id, attempts, created_at
              FROM payment.refund_order
             WHERE payment_id = #{paymentId} AND seller_order_id IS NULL AND reason = #{reason}
            """)
    Optional<RefundRow> findBySuspenseReason(@Param("paymentId") UUID paymentId, @Param("reason") String reason);

    /** false = 已经不是 pending（并发下另一个消费者先退了）。 */
    @Update(
            """
            UPDATE payment.refund_order
               SET status = 'success', channel_refund_id = #{channelRefundId}, completed_at = now()
             WHERE id = #{id} AND status = 'pending'
            """)
    boolean markSuccess(@Param("id") UUID id, @Param("channelRefundId") String channelRefundId);

    /** 渠道没受理的退款单，按创建时间挑出够老的、还没超重试上限的。 */
    @Select(
            """
            SELECT id, refund_no, payment_id, order_group_id, seller_order_id, amount, currency,
                   reason, status, channel_refund_id, attempts, created_at
              FROM payment.refund_order
             WHERE status = 'pending' AND created_at <= #{olderThan} AND attempts < #{maxAttempts}
             ORDER BY created_at
             LIMIT #{limit}
            """)
    List<RefundRow> findStalePending(
            @Param("olderThan") Instant olderThan, @Param("limit") int limit, @Param("maxAttempts") int maxAttempts);

    /** 尝试次数 +1，返回新值。超上限的判断交给调用方，这里不藏策略。 */
    default int incrementAttempts(UUID id) {
        Integer attempts = incrementAttemptsRow(id);
        if (attempts == null) {
            throw new IllegalStateException("退款单不存在: " + id);
        }
        return attempts;
    }

    @Select(
            """
            UPDATE payment.refund_order
               SET attempts = attempts + 1
             WHERE id = #{id}
            RETURNING attempts
            """)
    Integer incrementAttemptsRow(@Param("id") UUID id);

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
            String channelRefundId,
            int attempts,
            Instant createdAt) {}
}
