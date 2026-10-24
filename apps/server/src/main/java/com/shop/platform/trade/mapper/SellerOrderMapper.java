package com.shop.platform.trade.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.trade.model.CloseReason;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
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
public interface SellerOrderMapper extends BaseMapper<SellerOrderEntity> {

    String COLUMNS = "id, order_no AS orderNo, group_id AS groupId, merchant_id AS merchantId, shop_id AS shopId, "
            + "currency, goods_amount AS goodsAmount, discount_amount AS discountAmount, "
            + "shipping_amount AS shippingAmount, payable_amount AS payableAmount, "
            + "fulfillment_status AS fulfillmentStatus, closed_reason AS closedReason, closed_at AS closedAt";

    /** 下单整行落库；ship_address 的 jsonb 由实体的 PgJsonbTypeHandler 下发，不再 CAST。 */
    default void insert(NewSellerOrder order) {
        SellerOrderEntity row = new SellerOrderEntity();
        row.setId(order.id());
        row.setOrderNo(order.orderNo());
        row.setGroupId(order.groupId());
        row.setMerchantId(order.merchantId());
        row.setShopId(order.shopId());
        row.setCurrency(order.currency());
        row.setGoodsAmount(order.goodsAmount());
        row.setDiscountAmount(order.discountAmount());
        row.setShippingAmount(order.shippingAmount());
        row.setPayableAmount(order.payableAmount());
        row.setShipAddress(order.shipAddressJson());
        insert(row);
    }

    @Select("SELECT " + COLUMNS + " FROM trade.seller_order WHERE group_id = #{groupId} ORDER BY order_no")
    List<SellerOrderRow> findByGroup(@Param("groupId") UUID groupId);

    @Select("SELECT " + COLUMNS + " FROM trade.seller_order WHERE id = #{id}")
    Optional<SellerOrderRow> find(@Param("id") UUID id);

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
            String shipAddressJson) {}

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
