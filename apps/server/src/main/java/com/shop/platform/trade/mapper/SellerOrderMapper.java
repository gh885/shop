package com.shop.platform.trade.mapper;

import com.shop.platform.trade.model.CloseReason;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * {@code seller_order} 的写入与聚合状态重算。
 *
 * <p><b>子单不存 shipped_qty。</b> 那个数从行上聚合出来，存两份必然对不上。所以状态也是重算的，
 * 不是手动设的——每次包裹变化都从行计数器重新算一遍。
 */
@Mapper
public interface SellerOrderMapper {

    String COLUMNS = "id, order_no AS orderNo, group_id AS groupId, merchant_id AS merchantId, shop_id AS shopId, "
            + "currency, goods_amount AS goodsAmount, discount_amount AS discountAmount, "
            + "shipping_amount AS shippingAmount, payable_amount AS payableAmount, "
            + "fulfillment_status AS fulfillmentStatus, closed_reason AS closedReason, closed_at AS closedAt";

    /** 下单整行落库。fulfillment_status 由重算维护，closed_at / created_at 由数据库管，insert 都不碰。 */
    @Insert(
            """
            INSERT INTO trade.seller_order
                (id, order_no, group_id, merchant_id, shop_id, currency,
                 goods_amount, discount_amount, shipping_amount, payable_amount, shipping_address)
            VALUES (#{row.id}, #{row.orderNo}, #{row.groupId}, #{row.merchantId}, #{row.shopId}, #{row.currency},
                    #{row.goodsAmount}, #{row.discountAmount}, #{row.shippingAmount}, #{row.payableAmount},
                    CAST(#{row.shippingAddressJson} AS jsonb))
            """)
    void insert(@Param("row") NewSellerOrder order);

    @Select("SELECT " + COLUMNS + " FROM trade.seller_order WHERE group_id = #{groupId} ORDER BY order_no")
    List<SellerOrderRow> findByGroupInternal(@Param("groupId") UUID groupId);

    /**
     * 无归属点查，仅供内部链路（发货写回、退款、订单完成），调用方自己持有已验证的归属上下文。
     * 卖家侧的读必须绑 {@code merchant_id}，见 {@code DataScopeTest}。
     */
    @Select("SELECT " + COLUMNS + " FROM trade.seller_order WHERE id = #{id}")
    Optional<SellerOrderRow> findInternal(@Param("id") UUID id);

    /** 关闭子单。已关的跳过，重复调用无副作用。 */
    default boolean close(UUID id, CloseReason reason) {
        if (!reason.appliesToSellerOrder()) {
            throw new IllegalArgumentException("这个原因不能用在子单上: " + reason);
        }
        return closeRow(id, reason);
    }

    /** CAS 本体：0 行 = 已被抢先关闭。 */
    @Update(
            """
            UPDATE trade.seller_order
               SET closed_reason = #{reason}, closed_at = now()
             WHERE id = #{id} AND closed_at IS NULL
            """)
    boolean closeRow(@Param("id") UUID id, @Param("reason") CloseReason reason);

    /**
     * 从行计数器重算履约状态。
     *
     * <p>聚合态是算出来的：全部收到 → received；全部发出 → shipped；发了一部分 → partial_shipped；
     * 一件没发 → unshipped。**不许手动 set**，否则哪天包裹数据修了，子单状态就永远对不上。
     */
    @Update(
            """
            UPDATE trade.seller_order s
               SET fulfillment_status = CASE
                       WHEN agg.total_received >= agg.total_qty THEN 'received'
                       WHEN agg.total_shipped >= agg.total_qty THEN 'shipped'
                       WHEN agg.total_shipped > 0 THEN 'partial_shipped'
                       ELSE 'unshipped'
                   END
              FROM (
                  SELECT seller_order_id,
                         sum(quantity)  AS total_qty,
                         sum(shipped_qty)  AS total_shipped,
                         sum(received_qty) AS total_received
                    FROM trade.order_line
                   WHERE seller_order_id = #{sellerOrderId}
                   GROUP BY seller_order_id
              ) agg
             WHERE s.id = agg.seller_order_id
            """)
    void recomputeFulfillment(@Param("sellerOrderId") UUID sellerOrderId);

    /**
     * 完成订单的销量投影：按 SPU 合并<b>净件数</b>（{@code quantity - refunded_qty}）。
     * 完成前已退掉的不算卖出——否则「退一件再完成」的单会把退掉的件也计进销量。
     * 完成后发生的退款由 {@code recordRefund} 回冲，两边合起来净件数才守得住。
     */
    @Select(
            """
            <script>
            SELECT spu_id AS spuId, CAST(sum(quantity - refunded_qty) AS integer) AS quantity
              FROM trade.order_line
             WHERE seller_order_id IN
               <foreach collection="sellerOrderIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
             GROUP BY spu_id
            </script>
            """)
    List<SpuQuantity> quantitiesBySpu(@Param("sellerOrderIds") Collection<UUID> sellerOrderIds);

    record SpuQuantity(UUID spuId, int quantity) {}

    public record NewSellerOrder(
            UUID id,
            String orderNo,
            UUID groupId,
            UUID merchantId,
            UUID shopId,
            String currency,
            long goodsAmount,
            long discountAmount,
            long shippingAmount,
            long payableAmount,
            String shippingAddressJson) {}

    public record SellerOrderRow(
            UUID id,
            String orderNo,
            UUID groupId,
            UUID merchantId,
            UUID shopId,
            String currency,
            long goodsAmount,
            long discountAmount,
            long shippingAmount,
            long payableAmount,
            String fulfillmentStatus,
            CloseReason closedReason,
            java.time.Instant closedAt) {}
}
