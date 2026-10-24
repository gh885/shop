package com.shop.platform.trade.mapper;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 买家侧订单读模型的 SQL。
 *
 * <p>三次点查而不是一次大 JOIN：订单组 → 子单 → 行。JOIN 会把订单组那几列复制 N 遍，
 * 一个五商家十行的单会传回 50 份地址 JSON。三次点查的总代价更低，也更好读。
 *
 * <p>{@code displayStatus} 是算出来的：订单组只有支付和关闭两个维度，没有履约状态。
 */
@Mapper
public interface BuyerOrderReadMapper {

    /**
     * 展示态。
     *
     * <p>顺序有意义：先判关闭（关了的单不管付没付钱都不该显示"待付款"），再判支付。
     * 反过来会造出"已取消 + 待付款"这种自相矛盾的展示。
     */
    String DISPLAY_STATUS =
            """
            CASE
                WHEN g.closed_at IS NOT NULL AND g.payment_status = 'unpaid' THEN 'cancelled'
                WHEN g.closed_at IS NOT NULL AND g.payment_status = 'refunded' THEN 'refunded'
                WHEN g.closed_at IS NOT NULL THEN 'closed'
                WHEN g.payment_status = 'unpaid' THEN 'pending_payment'
                WHEN g.payment_status = 'paid' THEN 'paid'
                WHEN g.payment_status = 'partially_refunded' THEN 'partially_refunded'
                ELSE 'refunded'
            END
            """;

    @Select(
            """
            SELECT g.id, g.group_no AS groupNo, g.buyer_id AS buyerId, g.currency, g.payable_amount AS payableAmount,
                   g.paid_amount AS paidAmount, CAST(g.ship_address AS text) AS shipAddress,
                   g.expire_at AS expireAt, g.created_at AS createdAt,
            """
                    + DISPLAY_STATUS
                    + """
                      AS displayStatus
              FROM trade.order_group g
             WHERE g.id = #{id}
            """)
    Optional<GroupRow> findGroup(@Param("id") UUID orderGroupId);

    /**
     * 列表查询按条件拼，不写成一条万能 SQL：
     * 状态过滤是「有这个参数才多一段 AND」，游标是行值比较 {@code (created_at, id) < (#{cursorAt}, #{cursorId})}——
     * 只按 created_at 比较会串同一毫秒的行，id 是平局裁决。
     *
     * @param limit 传调用方的页大小 + 1：多取一条只为判断有没有下一页，下一页游标取本页最后一行的
     *             {@code (createdAt, id)}。{@code cursorAt}/{@code cursorId} 任一为 null 表示第一页，
     *             {@code status} 为 null 表示不过滤。
     */
    @Select(
            """
            <script>
            SELECT g.id, g.group_no AS groupNo, g.currency, g.payable_amount AS payableAmount, g.created_at AS createdAt,
            """
                    + DISPLAY_STATUS
                    + """
                      AS displayStatus
              FROM trade.order_group g
             WHERE g.buyer_id = #{buyerId}
            <if test="status != null">
               AND ("""
                    + DISPLAY_STATUS
                    + """
                      ) = #{status}
            </if>
            <if test="cursorAt != null">
               AND (g.created_at, g.id) &lt; (#{cursorAt}, #{cursorId})
            </if>
             ORDER BY g.created_at DESC, g.id DESC
             LIMIT #{limit}
            </script>
            """)
    List<SummaryRow> findByBuyer(
            @Param("buyerId") UUID buyerId,
            @Param("status") String status,
            @Param("cursorAt") Instant cursorAt,
            @Param("cursorId") UUID cursorId,
            @Param("limit") int limit);

    @Select(
            """
            SELECT id, order_no AS orderNo, shop_id AS shopId, currency, payable_amount AS payableAmount,
                   fulfillment_status AS fulfillmentStatus, closed_reason AS closedReason
              FROM trade.seller_order
             WHERE group_id = #{groupId}
             ORDER BY order_no
            """)
    List<SellerOrderRow> findSellerOrders(@Param("groupId") UUID orderGroupId);

    @Select(
            """
            <script>
            SELECT seller_order_id AS sellerOrderId, line_no AS lineNo, sku_id AS skuId, currency, quantity,
                   shipped_qty AS shippedQty, received_qty AS receivedQty, unit_amount AS unitAmount, payable,
                   title, image_url AS imageUrl, CAST(spec_values AS text) AS specValuesJson
              FROM trade.order_line
             WHERE seller_order_id IN
            <foreach collection="sellerOrderIds" item="id" open="(" separator="," close=")">#{id}</foreach>
             ORDER BY line_no
            </script>
            """)
    List<LineRow> findLinesByOrders(@Param("sellerOrderIds") List<UUID> sellerOrderIds);

    public record GroupRow(
            UUID id,
            String groupNo,
            UUID buyerId,
            String currency,
            long payableAmount,
            long paidAmount,
            String shipAddress,
            Instant expireAt,
            Instant createdAt,
            String displayStatus) {}

    public record SummaryRow(
            UUID id, String groupNo, String currency, long payableAmount, Instant createdAt, String displayStatus) {}

    public record SellerOrderRow(
            UUID id,
            String orderNo,
            UUID shopId,
            String currency,
            long payableAmount,
            String fulfillmentStatus,
            String closedReason) {}

    /**
     * @param specValuesJson 列是 {@code spec_values}，别名成驼峰才能对上 record 字段
     */
    public record LineRow(
            UUID sellerOrderId,
            int lineNo,
            UUID skuId,
            String currency,
            int quantity,
            int shippedQty,
            int receivedQty,
            long unitAmount,
            long payable,
            String title,
            String imageUrl,
            String specValuesJson) {}
}
