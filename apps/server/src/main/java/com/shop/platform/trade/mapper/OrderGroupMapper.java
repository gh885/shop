package com.shop.platform.trade.mapper;

import com.shop.platform.trade.model.CloseReason;
import com.shop.platform.trade.model.PaymentStatus;
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
 * {@code order_group} 的写入与状态迁移。
 *
 * <p><b>所有状态迁移都是条件更新，没有一条是"先查后改"。</b> 影响 0 行就是别人先动了，
 * 调用方必须把它当判决结果，不能当异常吞掉。
 */
@Mapper
public interface OrderGroupMapper {

    String COLUMNS = "id, group_no AS groupNo, buyer_id AS buyerId, quote_id AS quoteId, "
            + "payment_status AS paymentStatus, closed_at AS closedAt, closed_reason AS closedReason, "
            + "currency, goods_amount AS goodsAmount, discount_amount AS discountAmount, "
            + "shipping_amount AS shippingAmount, payable_amount AS payableAmount, "
            + "paid_amount AS paidAmount, refunded_amount AS refundedAmount, expires_at AS expiresAt";

    /** 下单整行落库。payment_status 等状态列留给列默认（'unpaid'），insert 不碰状态。 */
    @Insert(
            """
            INSERT INTO trade.order_group
                (id, group_no, buyer_id, quote_id, currency,
                 goods_amount, discount_amount, shipping_amount, payable_amount,
                 shipping_address, expires_at, idempotency_key)
            VALUES (#{row.id}, #{row.groupNo}, #{row.buyerId}, #{row.quoteId}, #{row.currency},
                    #{row.goodsAmount}, #{row.discountAmount}, #{row.shippingAmount}, #{row.payableAmount},
                    CAST(#{row.shipAddressJson} AS jsonb), #{row.expiresAt}, #{row.idempotencyKey})
            """)
    void insert(@Param("row") NewGroup group);

    /**
     * 无归属点查。买家侧读模型走 {@code BuyerOrderReadMapper.findGroup}（SQL 里绑 buyer_id）；
     * 这条只给内部链路（支付回调、关单、退款），它们自己持有已验证的上下文。
     * {@code DataScopeTest} 靠 Internal 后缀豁免，controller 调它会被 ArchUnit 拦下。
     */
    @Select("SELECT " + COLUMNS + " FROM trade.order_group WHERE id = #{id}")
    Optional<GroupRow> findInternal(@Param("id") UUID id);

    /**
     * 同键下单串行化的事务级 advisory lock：提交或回滚自动释放。
     *
     * <p>有了它，两个并发的同键请求不会各自通过"查重 → 插入"的竞态窗口；
     * 后到的在锁上等，先到的提交后它一查就命中 {@link #findByIdempotencyKey}。
     * 唯一索引 {@code uq_order_group_idem} 是它丢了之后的最后一道闸。
     */
    @Select("SELECT pg_advisory_xact_lock(hashtext(#{key}))")
    void lockIdempotency(@Param("key") String key);

    @Select("SELECT " + COLUMNS + " FROM trade.order_group WHERE buyer_id = #{buyerId} AND idempotency_key = #{key}")
    Optional<GroupRow> findByIdempotencyKey(@Param("buyerId") UUID buyerId, @Param("key") String key);

    /**
     * 超时关单。前置条件与支付回调**完全一样**，这就是胜负判决的地方。
     *
     * <p>不许把 {@code closed_at} 直接写上去而不看 {@code payment_status}：已付款的订单关闭只能走退款。
     */
    @Update(
            """
            UPDATE trade.order_group
               SET closed_at = now(), closed_reason = #{reason}
             WHERE id = #{id} AND payment_status = 'unpaid' AND closed_at IS NULL
            """)
    boolean close(@Param("id") UUID id, @Param("reason") CloseReason reason);

    /**
     * 支付成功。与超时关单同一前置条件，谁改到行谁赢。
     */
    @Update(
            """
            UPDATE trade.order_group
               SET payment_status = 'paid', paid_amount = #{paidAmount}, paid_at = now()
             WHERE id = #{id} AND payment_status = 'unpaid' AND closed_at IS NULL
            """)
    boolean markPaid(@Param("id") UUID id, @Param("paidAmount") long paidAmount);

    /** 超时任务扫描：只扫部分索引，分批。Internal——定时任务没有操作人归属。 */
    @Select("SELECT " + COLUMNS + " FROM trade.order_group\n"
            + " WHERE payment_status = 'unpaid' AND closed_at IS NULL AND expires_at < now() - interval '5 minutes'\n"
            + " ORDER BY expires_at\n"
            + " LIMIT #{limit}")
    List<GroupRow> findExpiredInternal(@Param("limit") int limit);

    /**
     * 加已退金额，并同步支付状态。
     *
     * <p>状态是<b>算出来的</b>，不是调用方传的：{@code refunded >= paid} 就是全额退完。
     * 让调用方传状态，等于允许它写一个和金额对不上的状态。
     */
    @Update(
            """
            UPDATE trade.order_group
               SET refunded_amount = refunded_amount + #{amount},
                   payment_status = CASE WHEN refunded_amount + #{amount} >= paid_amount
                                         THEN 'refunded' ELSE 'partially_refunded' END
             WHERE id = #{id} AND refunded_amount + #{amount} <= paid_amount
            """)
    boolean addRefunded(@Param("id") UUID id, @Param("amount") long amount);

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
            Instant expiresAt,
            String idempotencyKey) {}

    public record GroupRow(
            UUID id,
            String groupNo,
            UUID buyerId,
            UUID quoteId,
            PaymentStatus paymentStatus,
            Instant closedAt,
            CloseReason closedReason,
            String currency,
            long goodsAmount,
            long discountAmount,
            long shippingAmount,
            long payableAmount,
            long paidAmount,
            long refundedAmount,
            Instant expiresAt) {

        public boolean isOpen() {
            return closedAt == null;
        }
    }
}
