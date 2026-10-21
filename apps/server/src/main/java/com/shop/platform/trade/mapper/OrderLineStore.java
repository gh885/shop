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

    /** 行号列表。取消时要按 {@code (seller_order_id, line_no)} 逐行释放库存。 */
    public List<Integer> lineNosOf(UUID sellerOrderId) {
        return jdbc.queryForList(
                "SELECT line_no FROM trade.order_line WHERE seller_order_id = ? ORDER BY line_no",
                Integer.class,
                sellerOrderId);
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
