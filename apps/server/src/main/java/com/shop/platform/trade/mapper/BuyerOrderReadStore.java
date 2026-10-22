package com.shop.platform.trade.mapper;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

/**
 * 买家侧订单读模型的 SQL。
 *
 * <p>三次点查而不是一次大 JOIN：订单组 → 子单 → 行。JOIN 会把订单组那几列复制 N 遍，
 * 一个五商家十行的单会传回 50 份地址 JSON。三次点查的总代价更低，也更好读。
 *
 * <p>{@code displayStatus} 是算出来的：订单组只有支付和关闭两个维度，没有履约状态。
 */
@Component
public class BuyerOrderReadStore {

    /**
     * 展示态。
     *
     * <p>顺序有意义：先判关闭（关了的单不管付没付钱都不该显示"待付款"），再判支付。
     * 反过来会造出"已取消 + 待付款"这种自相矛盾的展示。
     */
    private static final String DISPLAY_STATUS =
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

    private static final String FIND_GROUP =
            """
            SELECT g.id, g.group_no, g.buyer_id, g.currency, g.payable_amount, g.paid_amount,
                   g.ship_address::text AS ship_address, g.expire_at, g.created_at,
                   %s AS display_status
              FROM trade.order_group g
             WHERE g.id = ?
            """
                    .formatted(DISPLAY_STATUS);

    private static final String FIND_BY_BUYER =
            """
            SELECT g.id, g.group_no, g.currency, g.payable_amount, g.created_at,
                   %s AS display_status
              FROM trade.order_group g
             WHERE g.buyer_id = ?
             ORDER BY g.created_at DESC
             LIMIT ?
            """
                    .formatted(DISPLAY_STATUS);

    private static final String FIND_SELLER_ORDERS =
            """
            SELECT id, order_no, shop_id, currency, payable_amount,
                   fulfillment_status, closed_reason
              FROM trade.seller_order
             WHERE group_id = ?
             ORDER BY order_no
            """;

    private static final String FIND_LINES =
            """
            SELECT line_no, sku_id, currency, quantity, shipped_qty, received_qty,
                   unit_amount, payable, title, image_url, spec_values::text AS spec_values
              FROM trade.order_line
             WHERE seller_order_id = ?
             ORDER BY line_no
            """;

    private static final RowMapper<GroupRow> GROUP_MAPPER = (rs, row) -> new GroupRow(
            rs.getObject("id", UUID.class),
            rs.getString("group_no"),
            rs.getObject("buyer_id", UUID.class),
            rs.getString("currency"),
            rs.getLong("payable_amount"),
            rs.getLong("paid_amount"),
            rs.getString("ship_address"),
            rs.getTimestamp("expire_at").toInstant(),
            rs.getTimestamp("created_at").toInstant(),
            rs.getString("display_status"));

    private static final RowMapper<SummaryRow> SUMMARY_MAPPER = (rs, row) -> new SummaryRow(
            rs.getObject("id", UUID.class),
            rs.getString("group_no"),
            rs.getString("currency"),
            rs.getLong("payable_amount"),
            rs.getTimestamp("created_at").toInstant(),
            rs.getString("display_status"));

    private final JdbcTemplate jdbc;

    public BuyerOrderReadStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public Optional<GroupRow> findGroup(UUID orderGroupId) {
        return jdbc.query(FIND_GROUP, GROUP_MAPPER, orderGroupId).stream().findFirst();
    }

    public List<SummaryRow> findByBuyer(UUID buyerId, int limit) {
        return jdbc.query(FIND_BY_BUYER, SUMMARY_MAPPER, buyerId, limit);
    }

    public List<SellerOrderRow> findSellerOrders(UUID orderGroupId) {
        return jdbc.query(
                FIND_SELLER_ORDERS,
                (rs, row) -> new SellerOrderRow(
                        rs.getObject("id", UUID.class),
                        rs.getString("order_no"),
                        rs.getObject("shop_id", UUID.class),
                        rs.getString("currency"),
                        rs.getLong("payable_amount"),
                        rs.getString("fulfillment_status"),
                        rs.getString("closed_reason")),
                orderGroupId);
    }

    public List<LineRow> findLines(UUID sellerOrderId) {
        return jdbc.query(
                FIND_LINES,
                (rs, row) -> new LineRow(
                        rs.getInt("line_no"),
                        rs.getObject("sku_id", UUID.class),
                        rs.getString("currency"),
                        rs.getInt("quantity"),
                        rs.getInt("shipped_qty"),
                        rs.getInt("received_qty"),
                        rs.getLong("unit_amount"),
                        rs.getLong("payable"),
                        rs.getString("title"),
                        rs.getString("image_url"),
                        rs.getString("spec_values")),
                sellerOrderId);
    }

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

    public record LineRow(
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
