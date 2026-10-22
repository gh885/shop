package com.shop.platform.trade.mapper;

import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * {@code order_line} 与 {@code order_line_discount} 的写入。
 *
 * <p>快照列只插不改；计数器的更新另外开方法，免得有人图省事一条 UPDATE 把快照也改了。
 */
@Component
public class OrderLineStore {

    private static final String INSERT_LINE =
            """
            INSERT INTO trade.order_line
                (id, seller_order_id, line_no, offer_id, sku_id, spu_id, currency, quantity,
                 unit_amount, subtotal, discount_amount, payable,
                 title, image_url, spec_values, category_id, brand_id, identity_key,
                 commission_rate_bp, rate_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?)
            """;

    private static final String INSERT_DISCOUNT =
            """
            INSERT INTO trade.order_line_discount
                (order_line_id, rule_id, rule_version, type, bearer, currency, amount)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """;

    private final JdbcTemplate jdbc;

    public OrderLineStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void insert(NewLine line) {
        jdbc.update(
                INSERT_LINE,
                line.id(),
                line.sellerOrderId(),
                line.lineNo(),
                line.offerId(),
                line.skuId(),
                line.spuId(),
                line.currency(),
                line.quantity(),
                line.unitAmount(),
                line.subtotal(),
                line.discountAmount(),
                line.payable(),
                line.title(),
                line.imageUrl(),
                line.specValuesJson(),
                line.categoryId(),
                line.brandId(),
                line.identityKey(),
                line.commissionRateBp(),
                line.rateVersion());
    }

    public void insertDiscount(UUID orderLineId, NewDiscount discount) {
        jdbc.update(
                INSERT_DISCOUNT,
                orderLineId,
                discount.ruleId(),
                discount.ruleVersion(),
                discount.type(),
                discount.bearer(),
                discount.currency(),
                discount.amount());
    }

    public List<UUID> lineIdsOf(UUID sellerOrderId) {
        return jdbc.queryForList(
                "SELECT id FROM trade.order_line WHERE seller_order_id = ? ORDER BY line_no",
                UUID.class,
                sellerOrderId);
    }

    /**
     * 每一行的可发货形状，{@code remaining} 由 SQL 算。
     *
     * <p>不让调用方自己减：超发就是超卖，而"还剩多少能发"这件事只有持有计数器的这一侧能做对。
     */
    public List<com.shop.platform.trade.api.TradeQuery.ShippableLine> findShippable(UUID sellerOrderId) {
        return jdbc.query(
                """
                SELECT id, line_no, sku_id, title, quantity, shipped_qty
                  FROM trade.order_line
                 WHERE seller_order_id = ?
                 ORDER BY line_no
                """,
                (rs, row) -> new com.shop.platform.trade.api.TradeQuery.ShippableLine(
                        rs.getObject("id", UUID.class),
                        rs.getInt("line_no"),
                        rs.getObject("sku_id", UUID.class),
                        rs.getString("title"),
                        rs.getInt("quantity"),
                        rs.getInt("shipped_qty"),
                        rs.getInt("quantity") - rs.getInt("shipped_qty")),
                sellerOrderId);
    }

    /** 行号列表。取消时要按 {@code (seller_order_id, line_no)} 逐行释放库存。 */
    public List<Integer> lineNosOf(UUID sellerOrderId) {
        return jdbc.queryForList(
                "SELECT line_no FROM trade.order_line WHERE seller_order_id = ? ORDER BY line_no",
                Integer.class,
                sellerOrderId);
    }

    /**
     * 加发货数量。
     *
     * <p>条件里带 {@code shipped_qty + ? <= quantity}：发超了影响 0 行，调用方据此报错。
     * 这比先查再改可靠——查和改之间的窗口就是发超。
     */
    public boolean addShipped(UUID sellerOrderId, int lineNo, int quantity) {
        return jdbc.update(
                        """
                        UPDATE trade.order_line
                           SET shipped_qty = shipped_qty + ?
                         WHERE seller_order_id = ? AND line_no = ? AND shipped_qty + ? <= quantity
                        """,
                        quantity,
                        sellerOrderId,
                        lineNo,
                        quantity)
                == 1;
    }

    /** 加签收数量。签收不能超过已发货量。 */
    public boolean addReceived(UUID sellerOrderId, int lineNo, int quantity) {
        return jdbc.update(
                        """
                        UPDATE trade.order_line
                           SET received_qty = received_qty + ?
                         WHERE seller_order_id = ? AND line_no = ? AND received_qty + ? <= shipped_qty
                        """,
                        quantity,
                        sellerOrderId,
                        lineNo,
                        quantity)
                == 1;
    }

    public record NewLine(
            UUID id,
            UUID sellerOrderId,
            int lineNo,
            UUID offerId,
            UUID skuId,
            UUID spuId,
            String currency,
            int quantity,
            long unitAmount,
            long subtotal,
            long discountAmount,
            long payable,
            String title,
            String imageUrl,
            String specValuesJson,
            UUID categoryId,
            UUID brandId,
            String identityKey,
            int commissionRateBp,
            String rateVersion) {}

    public record NewDiscount(
            UUID ruleId, String ruleVersion, String type, String bearer, String currency, long amount) {}
}
