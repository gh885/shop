package com.shop.platform.trade.mapper;

import com.shop.platform.trade.model.CloseReason;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

/**
 * {@code seller_order} 的写入与聚合状态重算。
 *
 * <p><b>子单不存 shipped_qty。</b> 那个数从行上聚合出来，存两份必然对不上。所以状态也是重算的，
 * 不是手动设的——每次包裹变化都从行计数器重新算一遍。
 */
@Component
public class SellerOrderStore {

    private static final String INSERT =
            """
            INSERT INTO trade.seller_order
                (id, order_no, group_id, merchant_id, shop_id, currency,
                 goods_amount, discount_amount, shipping_amount, payable_amount, ship_address)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
            """;

    private static final String COLUMNS =
            "id, order_no, group_id, merchant_id, shop_id, currency, goods_amount, discount_amount, "
                    + "shipping_amount, payable_amount, fulfillment_status, closed_reason, closed_at";

    private static final String FIND_BY_GROUP =
            """
            SELECT %s FROM trade.seller_order WHERE group_id = ? ORDER BY order_no
            """
                    .formatted(COLUMNS);

    private static final String FIND =
            """
            SELECT %s FROM trade.seller_order WHERE id = ?
            """.formatted(COLUMNS);

    /** 关闭子单。已关的跳过，重复调用无副作用。 */
    private static final String CLOSE =
            """
            UPDATE trade.seller_order
               SET closed_reason = ?, closed_at = now()
             WHERE id = ? AND closed_at IS NULL
            """;

    /**
     * 从行计数器重算履约状态。
     *
     * <p>聚合态是算出来的：全部收到 → received；全部发出 → shipped；发了一部分 → partial_shipped；
     * 一件没发 → unshipped。**不许手动 set**，否则哪天包裹数据修了，子单状态就永远对不上。
     */
    private static final String RECOMPUTE_FULFILLMENT =
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
                   WHERE seller_order_id = ?
                   GROUP BY seller_order_id
              ) agg
             WHERE s.id = agg.seller_order_id
            """;

    private static final RowMapper<SellerOrderRow> MAPPER = (rs, row) -> new SellerOrderRow(
            rs.getObject("id", UUID.class),
            rs.getString("order_no"),
            rs.getObject("group_id", UUID.class),
            rs.getObject("merchant_id", UUID.class),
            rs.getObject("shop_id", UUID.class),
            rs.getString("currency"),
            rs.getLong("goods_amount"),
            rs.getLong("discount_amount"),
            rs.getLong("shipping_amount"),
            rs.getLong("payable_amount"),
            rs.getString("fulfillment_status"),
            CloseReason.from(rs.getString("closed_reason")),
            rs.getTimestamp("closed_at") == null
                    ? null
                    : rs.getTimestamp("closed_at").toInstant());

    private final JdbcTemplate jdbc;

    public SellerOrderStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void insert(NewSellerOrder order) {
        jdbc.update(
                INSERT,
                order.id(),
                order.orderNo(),
                order.groupId(),
                order.merchantId(),
                order.shopId(),
                order.currency(),
                order.goodsAmount(),
                order.discountAmount(),
                order.shippingAmount(),
                order.payableAmount(),
                order.shipAddressJson());
    }

    public List<SellerOrderRow> findByGroup(UUID groupId) {
        return jdbc.query(FIND_BY_GROUP, MAPPER, groupId);
    }

    public Optional<SellerOrderRow> find(UUID id) {
        return jdbc.query(FIND, MAPPER, id).stream().findFirst();
    }

    public boolean close(UUID id, CloseReason reason) {
        if (!reason.appliesToSellerOrder()) {
            throw new IllegalArgumentException("这个原因不能用在子单上: " + reason);
        }
        return jdbc.update(CLOSE, reason.dbValue(), id) == 1;
    }

    public void recomputeFulfillment(UUID sellerOrderId) {
        jdbc.update(RECOMPUTE_FULFILLMENT, sellerOrderId);
    }

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
