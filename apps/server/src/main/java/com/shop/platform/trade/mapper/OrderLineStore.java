package com.shop.platform.trade.mapper;

import com.shop.platform.infra.db.RowMappers;
import com.shop.platform.inventory.api.InventoryCommand;
import com.shop.platform.trade.api.TradeQuery;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
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

    /** 一批子单的全部 (子单, 行号)。整单 commit/release 库存用它一次取回，不再逐子单查。 */
    private static final String LINE_REFS = "SELECT seller_order_id, line_no FROM trade.order_line"
            + " WHERE seller_order_id IN (:sellerOrderIds) ORDER BY line_no";

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
                   (quantity - shipped_qty - refunded_qty) AS remaining
              FROM trade.order_line
             WHERE seller_order_id = :sellerOrderId
             ORDER BY line_no
            """;

    /**
     * 售后要用的一行事实。
     *
     * <p>三张表 JOIN 是因为 buyer 在 group 上、merchant 在子单上、实付在行上——售后要一次拿全，
     * 分三次查中间可能夹进一次退款，算出来的上限就不对了。
     */
    private static final String FIND_REFUNDABLE =
            """
            SELECT l.id AS order_line_id, l.seller_order_id, s.group_id AS order_group_id, s.merchant_id,
                   g.buyer_id, g.currency, l.quantity, l.refunded_qty, l.payable, l.refunded_amount
              FROM trade.order_line l
              JOIN trade.seller_order s ON s.id = l.seller_order_id
              JOIN trade.order_group g ON g.id = s.group_id
             WHERE l.id = :orderLineId AND g.payment_status = 'paid'
            """;

    /**
     * 同一份事实，按 (子单, 行号) 查——买家端只知道自己看到的行号，不知道行 id。
     *
     * <p>只认已付款的订单（和上面的按 id 查一致）：未付款的订单没有"退"可言，
     * 售后走到冻结那一步只会炸出一个 500。
     */
    private static final String FIND_REFUNDABLE_BY_LINE_NO =
            """
            SELECT l.id AS order_line_id, l.seller_order_id, s.group_id AS order_group_id, s.merchant_id,
                   g.buyer_id, g.currency, l.quantity, l.refunded_qty, l.payable, l.refunded_amount
              FROM trade.order_line l
              JOIN trade.seller_order s ON s.id = l.seller_order_id
              JOIN trade.order_group g ON g.id = s.group_id
             WHERE l.seller_order_id = :sellerOrderId AND l.line_no = :lineNo AND g.payment_status = 'paid'
            """;

    /**
     * 加退款数量与金额。
     *
     * <p>两条上限都在 where 里：件数不超过 {@code quantity}，金额（含已取消部分）不超过 {@code payable}。
     * 超了影响 0 行，调用方据此回滚——先查再改的窗口就是退多的窗口。
     */
    private static final String ADD_REFUNDED =
            """
            UPDATE trade.order_line
               SET refunded_qty = refunded_qty + :qty,
                   refunded_amount = refunded_amount + :amount
             WHERE id = :orderLineId
               AND refunded_qty + :qty <= quantity
               AND cancelled_amount + refunded_amount + :amount <= payable
            """;

    /**
     * 加发货数量。
     *
     * <p>条件里带 {@code shipped_qty + :qty <= quantity - refunded_qty}：发超了影响 0 行，
     * 调用方据此报错。已退的件不许再发——全额退款未发货的单，这里就是"钱货两得"的最后一道闸。
     */
    private static final String ADD_SHIPPED =
            """
            UPDATE trade.order_line
               SET shipped_qty = shipped_qty + :qty
             WHERE seller_order_id = :sellerOrderId AND line_no = :lineNo
               AND shipped_qty + :qty <= quantity - refunded_qty
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

    private final NamedParameterJdbcTemplate batch;

    public OrderLineStore(JdbcClient jdbc, NamedParameterJdbcTemplate batch) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.batch = Objects.requireNonNull(batch, "batch");
    }

    /** 下单一个子单的全部行一次批量写入；orderLineId 由调用方先生成，分摊才挂得上。 */
    public void insertAll(List<NewLine> lines) {
        if (lines.isEmpty()) {
            return;
        }
        List<SqlParameterSource> params = new ArrayList<>(lines.size());
        for (NewLine line : lines) {
            params.add(new MapSqlParameterSource()
                    .addValue("id", line.id())
                    .addValue("sellerOrderId", line.sellerOrderId())
                    .addValue("lineNo", line.lineNo())
                    .addValue("offerId", line.offerId())
                    .addValue("skuId", line.skuId())
                    .addValue("spuId", line.spuId())
                    .addValue("currency", line.currency())
                    .addValue("quantity", line.quantity())
                    .addValue("unitAmount", line.unitAmount())
                    .addValue("subtotal", line.subtotal())
                    .addValue("discountAmount", line.discountAmount())
                    .addValue("payable", line.payable())
                    .addValue("title", line.title())
                    .addValue("imageUrl", line.imageUrl())
                    .addValue("specValues", line.specValuesJson())
                    .addValue("categoryId", line.categoryId())
                    .addValue("brandId", line.brandId())
                    .addValue("identityKey", line.identityKey())
                    .addValue("commissionRateBp", line.commissionRateBp())
                    .addValue("rateVersion", line.rateVersion()));
        }
        batch.batchUpdate(INSERT_LINE, params.toArray(SqlParameterSource[]::new));
    }

    /** 全部优惠分摊一次批量写入。 */
    public void insertDiscounts(List<NewDiscount> discounts) {
        if (discounts.isEmpty()) {
            return;
        }
        List<SqlParameterSource> params = new ArrayList<>(discounts.size());
        for (NewDiscount discount : discounts) {
            params.add(new MapSqlParameterSource()
                    .addValue("orderLineId", discount.orderLineId())
                    .addValue("ruleId", discount.ruleId())
                    .addValue("ruleVersion", discount.ruleVersion())
                    .addValue("type", discount.type())
                    .addValue("bearer", discount.bearer())
                    .addValue("currency", discount.currency())
                    .addValue("amount", discount.amount()));
        }
        batch.batchUpdate(INSERT_DISCOUNT, params.toArray(SqlParameterSource[]::new));
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

    public Optional<TradeQuery.RefundableLine> findRefundable(UUID orderLineId) {
        return jdbc.sql(FIND_REFUNDABLE)
                .param("orderLineId", orderLineId)
                .query(RowMappers.of(TradeQuery.RefundableLine.class))
                .optional();
    }

    public Optional<TradeQuery.RefundableLine> findRefundable(UUID sellerOrderId, int lineNo) {
        return jdbc.sql(FIND_REFUNDABLE_BY_LINE_NO)
                .param("sellerOrderId", sellerOrderId)
                .param("lineNo", lineNo)
                .query(RowMappers.of(TradeQuery.RefundableLine.class))
                .optional();
    }

    /** false = 超了件数或金额上限，什么都没改。 */
    public boolean addRefunded(UUID orderLineId, int quantity, long amount) {
        return jdbc.sql(ADD_REFUNDED)
                        .param("orderLineId", orderLineId)
                        .param("qty", quantity)
                        .param("amount", amount)
                        .update()
                == 1;
    }

    /** 一批子单的行号引用，交 {@code inventory.commitAll / releaseAll}。 */
    public List<InventoryCommand.OrderLineRef> lineRefsOf(List<UUID> sellerOrderIds) {
        return jdbc.sql(LINE_REFS)
                .param("sellerOrderIds", sellerOrderIds)
                .query((rs, rowNum) -> new InventoryCommand.OrderLineRef(
                        rs.getObject("seller_order_id", UUID.class), rs.getInt("line_no")))
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
            UUID orderLineId,
            UUID ruleId,
            String ruleVersion,
            String type,
            String bearer,
            String currency,
            long amount) {}
}
