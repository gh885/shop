package com.shop.platform.trade.mapper;

import com.shop.platform.infra.security.AccessScope;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 卖家侧订单读模型的 SQL。
 *
 * <p><b>与买家侧分开写，不共用一条 SQL。</b> 理由不是「两边字段不同」，是**展示态不同**：
 *
 * <ul>
 *   <li>买家关心「付没付、退没退」，所以他的主状态轴是 {@code payment_status}
 *   <li>卖家关心「要不要发货、发到哪一步」，所以他的主状态轴是 {@code fulfillment_status}
 * </ul>
 *
 * <p>合成一条 SQL 的结果是两边各有一半字段用不上，而任何一个状态口径调整都要同时想两遍。
 * 代价是两条 SQL 里的 {@code CASE} 要各自维护——但那是两种业务判断，本来就不该共用。
 *
 * <p><b>归属列进 SQL。</b> 每一条都绑 {@code merchant_id}（{@code DataScopeTest} 管辖）：
 * 别家的单查出来是空集，不是「查出来再比对」。唯一不绑的是 {@code ...Internal} 后缀的那几条，
 * 那是给内部链路（发货写回、事件消费）用的，调用方自己持有已验证的归属上下文。
 */
@Mapper
public interface SellerOrderReadMapper {

    /**
     * 卖家的展示态。
     *
     * <p>顺序有意义，且与买家侧**不同**：
     *
     * <ol>
     *   <li>先判关闭——关了的单不管发没发都不该出现在「待发货」里
     *   <li>再判未付款——买家还没付，商家不该备货（但能看见，否则他不知道有人在等）
     *   <li>然后才是履约进度：待发货 / 部分发货 / 已发货 / 已签收
     * </ol>
     *
     * <p>「已签收」用 {@code received} 而不是 {@code completed}：子单上只有履约状态，
     * 交易完成是订单组的概念（全部子单都签收），卖家看子单时那个词没有对应物。
     */
    String DISPLAY_STATUS =
            """
            CASE
                WHEN s.closed_at IS NOT NULL THEN 'closed'
                WHEN g.payment_status = 'unpaid' THEN 'pending_payment'
                WHEN s.fulfillment_status = 'unshipped' THEN 'awaiting_shipment'
                WHEN s.fulfillment_status = 'partial_shipped' THEN 'partially_shipped'
                WHEN s.fulfillment_status = 'shipped' THEN 'shipped'
                ELSE 'received'
            END
            """;

    /**
     * 列表。按 {@code created_at DESC, id DESC} 游标翻页；筛状态是「有这个参数才多一段 AND」。
     *
     * <p><b>为什么按子单而不是按订单组列表。</b> 商家发货、看包裹、处理售后都以子单为单位——
     * 一个买家跨三家店下单，三家店各看各的那一份。按订单组列会让每家店看见另外两家的商品。
     * 空的店铺集合折成恒假条件，不会拼出 {@code IN ()}。
     *
     * @param scope 判权凭据：归属商家与操作人的店铺授权都随它进来
     * @param status 展示态词表，null = 不过滤
     * @param cursorAt / cursorId 同生同死，任一为 null 表示第一页
     * @param limit 调用方传页大小 + 1（多取一条判断有没有下一页）
     */
    @Select(
            """
            <script>
            SELECT s.id, s.order_no AS orderNo, s.group_id AS groupId, s.shop_id AS shopId, s.currency,
                   s.goods_amount AS goodsAmount, s.discount_amount AS discountAmount,
                   s.shipping_amount AS shippingAmount, s.payable_amount AS payableAmount,
                   s.fulfillment_status AS fulfillmentStatus, s.created_at AS createdAt,
            """
                    + DISPLAY_STATUS
                    + """
                      AS displayStatus
              FROM trade.seller_order s
              JOIN trade.order_group g ON g.id = s.group_id
             WHERE s.merchant_id = #{scope.merchantId}
               AND s.shop_id IN
              <choose>
                <when test="scope.shopIds.size() > 0">
                  <foreach collection="scope.shopIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
                </when>
                <!-- 空集合不拼 IN：直接给恒假条件，返回空集而不是语法错误 -->
                <otherwise>(SELECT NULL::uuid WHERE false)</otherwise>
              </choose>
            <if test="status != null">
               AND ("""
                    + DISPLAY_STATUS
                    + """
                      ) = #{status}
            </if>
            <if test="cursorAt != null">
               AND (s.created_at, s.id) &lt; (#{cursorAt}, #{cursorId})
            </if>
             ORDER BY s.created_at DESC, s.id DESC
             LIMIT #{limit}
            </script>
            """)
    List<SummaryRow> findByMerchant(
            @Param("scope") AccessScope.Seller scope,
            @Param("status") String status,
            @Param("cursorAt") Instant cursorAt,
            @Param("cursorId") UUID cursorId,
            @Param("limit") int limit);

    /**
     * 卖家看一张子单：归属列进 SQL，别家的单查出空，service 折 404。
     *
     * <p>带上 {@code shipping_address}：商家发货必须知道寄到哪。这与买家侧不同——
     * 买家详情里那是自己的地址，商家详情里那是**别人**的地址，所以：
     *
     * <ul>
     *   <li>手机号在 service 边界脱敏，只有「发货」这个动作才给完整号码（见 SellerOrderQuery）
     *   <li>地址快照是下单那一刻的，改地址簿不影响它（订单不引用地址簿）
     * </ul>
     */
    @Select(
            """
            <script>
            SELECT s.id, s.order_no AS orderNo, s.group_id AS groupId, s.shop_id AS shopId, s.currency,
                   s.goods_amount AS goodsAmount, s.discount_amount AS discountAmount,
                   s.shipping_amount AS shippingAmount, s.payable_amount AS payableAmount,
                   s.fulfillment_status AS fulfillmentStatus, s.closed_reason AS closedReason,
                   s.closed_at AS closedAt, s.created_at AS createdAt,
                   CAST(s.shipping_address AS text) AS shippingAddressJson,
                   g.group_no AS groupNo, g.payment_status AS paymentStatus, g.paid_at AS paidAt,
            """
                    + DISPLAY_STATUS
                    + """
                      AS displayStatus
              FROM trade.seller_order s
              JOIN trade.order_group g ON g.id = s.group_id
             WHERE s.id = #{sellerOrderId}
               AND s.merchant_id = #{scope.merchantId}
               AND s.shop_id IN
              <choose>
                <when test="scope.shopIds.size() > 0">
                  <foreach collection="scope.shopIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
                </when>
                <!-- 空集合不拼 IN：直接给恒假条件，返回空集而不是语法错误 -->
                <otherwise>(SELECT NULL::uuid WHERE false)</otherwise>
              </choose>
            </script>
            """)
    Optional<DetailRow> findDetail(
            @Param("sellerOrderId") UUID sellerOrderId, @Param("scope") AccessScope.Seller scope);

    /**
     * 一张子单的行。归属由 {@code findDetail} 验过，这里按 {@code seller_order_id} 取不再绑列。
     *
     * <p>带 {@code shipped_qty} / {@code refunded_qty}：商家要看见「这行还剩多少可发」，
     * 自己减 {@code quantity - shipped_qty} 会在部分退款后算错（已退的件不许再发）。
     * 剩余量由 trade 算，见 {@code TradeQuery.ShippableLine}。
     */
    @Select(
            """
            SELECT id, line_no AS lineNo, sku_id AS skuId, spu_id AS spuId, currency, quantity,
                   unit_amount AS unitAmount, subtotal, discount_amount AS discountAmount,
                   payable_amount AS payableAmount, shipped_qty AS shippedQty,
                   received_qty AS receivedQty, refunded_qty AS refundedQty,
                   refunded_amount AS refundedAmount,
                   title, image_url AS imageUrl, CAST(spec_values AS text) AS specValuesJson
              FROM trade.order_line
             WHERE seller_order_id = #{sellerOrderId}
             ORDER BY line_no
            """)
    List<LineRow> findLines(@Param("sellerOrderId") UUID sellerOrderId);

    /** 列表的一行。够画一张卡片：单号、金额、状态、时间。 */
    record SummaryRow(
            UUID id,
            String orderNo,
            UUID groupId,
            UUID shopId,
            String currency,
            long goodsAmount,
            long discountAmount,
            long shippingAmount,
            long payableAmount,
            String fulfillmentStatus,
            String displayStatus,
            Instant createdAt) {}

    /** 详情的一行。{@code shippingAddressJson} 是下单快照，解析成值对象在 service 做。 */
    record DetailRow(
            UUID id,
            String orderNo,
            UUID groupId,
            UUID shopId,
            String currency,
            long goodsAmount,
            long discountAmount,
            long shippingAmount,
            long payableAmount,
            String fulfillmentStatus,
            String closedReason,
            Instant closedAt,
            Instant createdAt,
            String shippingAddressJson,
            String groupNo,
            String paymentStatus,
            Instant paidAt,
            String displayStatus) {}

    /** 订单行。{@code specValuesJson} 原样给前端，解析成 Map 是展示层的事。 */
    record LineRow(
            UUID id,
            int lineNo,
            UUID skuId,
            UUID spuId,
            String currency,
            int quantity,
            long unitAmount,
            long subtotal,
            long discountAmount,
            long payableAmount,
            int shippedQty,
            int receivedQty,
            int refundedQty,
            long refundedAmount,
            String title,
            String imageUrl,
            String specValuesJson) {}
}
