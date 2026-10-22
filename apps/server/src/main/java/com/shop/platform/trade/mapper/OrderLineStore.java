package com.shop.platform.trade.mapper;

import com.shop.platform.infra.db.RowMappers;
import com.shop.platform.trade.api.TradeQuery;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
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
            VALUES (:id, :sellerOrderId, :lineNo, :offerId, :skuId, :spuId, :currency, :quantity,
                    :unitAmount, :subtotal, :discountAmount, :payable,
                    :title, :imageUrl, CAST(:specValues AS jsonb), :categoryId, :brandId, :identityKey,
                    :commissionRateBp, :rateVersion)
            """;

    private static final String INSERT_DISCOUNT =
            """
            INSERT INTO trade.order_line_discount
                (order_line_id, rule_id, rule_version, type, bearer, currency, amount)
            VALUES (:orderLineId, :ruleId, :ruleVersion, :type, :bearer, :currency, :amount)
            """;

    private static final String LINE_IDS =
            "SELECT id FROM trade.order_line WHERE seller_order_id = :sellerOrderId ORDER BY line_no";

    private static final String LINE_NOS =
            "SELECT line_no FROM trade.order_line WHERE seller_order_id = :sellerOrderId ORDER BY line_no";

    /**
     * 每一行的可发货形状，{@code remaining} 由 SQL 算。
     *
     * <p>不让调用方自己减：超发就是超卖，而"还剩多少能发"这件事只有持有计数器的这一侧能做对。
     *
     * <p>{@code remaining} 必须是 SQL 里的别名列，不能靠 record 里的计算属性——映射器按列名找值，
     * 找不到就抛异常，它不会去调你的方法。
     */
    private static final String FIND_SHIPPABLE =
            """
            SELECT id AS order_line_id, line_no, sku_id, title, quantity, shipped_qty,
                   (quantity - shipped_qty) AS remaining
              FROM trade.order_line
             WHERE seller_order_id = :sellerOrderId
             ORDER BY line_no
            """;

    /**
     * 加发货数量。
     *
     * <p>条件里带 {@code shipped_qty + :qty <= quantity}：发超了影响 0 行，调用方据此报错。
     * 这比先查再改可靠——查和改之间的窗口就是发超。
     */
    private static final String ADD_SHIPPED =
            """
            UPDATE trade.order_line
               SET shipped_qty = shipped_qty + :qty
             WHERE seller_order_id = :sellerOrderId AND line_no = :lineNo AND shipped_qty + :qty <= quantity
            """;

    /** 加签收数量。签收不能超过已发货量。 */
    private static final String ADD_RECEIVED =
            """
            UPDATE trade.order_line
               SET received_qty = received_qty + :qty
             WHERE seller_order_id = :sellerOrderId AND line_no = :lineNo AND received_qty + :qty <= shipped_qty
            """;

    private static final RowMapper<TradeQuery.ShippableLine> SHIPPABLE = RowMappers.of(TradeQuery.ShippableLine.class);

    private final JdbcClient jdbc;

    public OrderLineStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void insert(NewLine line) {
        jdbc.sql(INSERT_LINE)
                .param("id", line.id())
                .param("sellerOrderId", line.sellerOrderId())
                .param("lineNo", line.lineNo())
                .param("offerId", line.offerId())
                .param("skuId", line.skuId())
                .param("spuId", line.spuId())
                .param("currency", line.currency())
                .param("quantity", line.quantity())
                .param("unitAmount", line.unitAmount())
                .param("subtotal", line.subtotal())
                .param("discountAmount", line.discountAmount())
                .param("payable", line.payable())
                .param("title", line.title())
                .param("imageUrl", line.imageUrl())
                .param("specValues", line.specValuesJson())
                .param("categoryId", line.categoryId())
                .param("brandId", line.brandId())
                .param("identityKey", line.identityKey())
                .param("commissionRateBp", line.commissionRateBp())
                .param("rateVersion", line.rateVersion())
                .update();
    }

    public void insertDiscount(UUID orderLineId, NewDiscount discount) {
        jdbc.sql(INSERT_DISCOUNT)
                .param("orderLineId", orderLineId)
                .param("ruleId", discount.ruleId())
                .param("ruleVersion", discount.ruleVersion())
                .param("type", discount.type())
                .param("bearer", discount.bearer())
                .param("currency", discount.currency())
                .param("amount", discount.amount())
                .update();
    }

    public List<UUID> lineIdsOf(UUID sellerOrderId) {
        return jdbc.sql(LINE_IDS)
                .param("sellerOrderId", sellerOrderId)
                .query(UUID.class)
                .list();
    }

    public List<TradeQuery.ShippableLine> findShippable(UUID sellerOrderId) {
        return jdbc.sql(FIND_SHIPPABLE)
                .param("sellerOrderId", sellerOrderId)
                .query(SHIPPABLE)
                .list();
    }

    /** 行号列表。取消时要按 {@code (seller_order_id, line_no)} 逐行释放库存。 */
    public List<Integer> lineNosOf(UUID sellerOrderId) {
        return jdbc.sql(LINE_NOS)
                .param("sellerOrderId", sellerOrderId)
                .query(Integer.class)
                .list();
    }

    public boolean addShipped(UUID sellerOrderId, int lineNo, int quantity) {
        return jdbc.sql(ADD_SHIPPED)
                        .param("qty", quantity)
                        .param("sellerOrderId", sellerOrderId)
                        .param("lineNo", lineNo)
                        .update()
                == 1;
    }

    public boolean addReceived(UUID sellerOrderId, int lineNo, int quantity) {
        return jdbc.sql(ADD_RECEIVED)
                        .param("qty", quantity)
                        .param("sellerOrderId", sellerOrderId)
                        .param("lineNo", lineNo)
                        .update()
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
