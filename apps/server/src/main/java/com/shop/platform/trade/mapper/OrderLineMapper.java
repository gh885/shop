package com.shop.platform.trade.mapper;

import com.shop.platform.inventory.api.InventoryCommand;
import com.shop.platform.trade.api.TradeQuery;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * {@code order_line} 与 {@code order_line_discount} 的写入。
 *
 * <p>快照列只插不改；计数器的更新另外开方法，免得有人图省事一条 UPDATE 把快照也改了。
 */
@Mapper
public interface OrderLineMapper {

    /**
     * 下单一个子单的全部行写入；orderLineId 由调用方先生成，分摊才挂得上。
     * 计数器列（shipped_qty 等）留库默认 0；快照列只插不改。
     */
    @Insert(
            """
            INSERT INTO trade.order_line
                (id, seller_order_id, line_no, listing_id, sku_id, spu_id, currency,
                 quantity, unit_amount, subtotal, discount_amount, payable_amount,
                 title, image_url, spec_values, category_id, brand_id, identity_key,
                 commission_rate_bp, rate_version)
            VALUES (#{row.id}, #{row.sellerOrderId}, #{row.lineNo}, #{row.listingId}, #{row.skuId}, #{row.spuId}, #{row.currency},
                    #{row.quantity}, #{row.unitAmount}, #{row.subtotal}, #{row.discountAmount}, #{row.payableAmount},
                    #{row.title}, #{row.imageUrl}, CAST(#{row.specValuesJson} AS jsonb), #{row.categoryId}, #{row.brandId}, #{row.identityKey},
                    #{row.commissionRateBp}, #{row.rateVersion})
            """)
    void insertLine(@Param("row") NewLine line);

    default void insertAll(List<NewLine> lines) {
        for (NewLine line : lines) {
            insertLine(line);
        }
    }

    /** 全部优惠分摊写入，逐行执行，同一事务。 */
    default void insertDiscounts(List<NewDiscount> discounts) {
        for (NewDiscount discount : discounts) {
            insertDiscount(
                    discount.orderLineId(),
                    discount.ruleId(),
                    discount.ruleVersion(),
                    discount.type(),
                    discount.bearer(),
                    discount.currency(),
                    discount.amount());
        }
    }

    @Insert(
            """
            INSERT INTO trade.order_line_discount
                (order_line_id, rule_id, rule_version, type, bearer, currency, amount)
            VALUES (#{orderLineId}, #{ruleId}, #{ruleVersion}, #{type}, #{bearer}, #{currency}, #{amount})
            """)
    void insertDiscount(
            @Param("orderLineId") UUID orderLineId,
            @Param("ruleId") UUID ruleId,
            @Param("ruleVersion") String ruleVersion,
            @Param("type") String type,
            @Param("bearer") String bearer,
            @Param("currency") String currency,
            @Param("amount") long amount);

    @Select("SELECT id FROM trade.order_line WHERE seller_order_id = #{sellerOrderId} ORDER BY line_no")
    List<UUID> lineIdsOf(@Param("sellerOrderId") UUID sellerOrderId);

    /** 一批子单的行号引用，交 {@code inventory.commitAll / releaseAll}。 */
    @Select(
            """
            <script>
            SELECT seller_order_id AS sellerOrderId, line_no AS lineNo
              FROM trade.order_line
             WHERE seller_order_id IN
                   <foreach collection="sellerOrderIds" item="id" open="(" separator="," close=")">#{id}</foreach>
             ORDER BY line_no
            </script>
            """)
    List<InventoryCommand.OrderLineRef> lineRefsOf(@Param("sellerOrderIds") List<UUID> sellerOrderIds);

    /**
     * 每一行的可发货形状，{@code remaining} 由 SQL 算。
     *
     * <p>不让调用方自己减：超发就是超卖，而"还剩多少能发"这件事只有持有计数器的这一侧能做对。
     *
     * <p>{@code remaining} 必须是 SQL 里的别名列，不能靠 record 里的计算属性——映射器按列名找值，
     * 找不到就抛异常，它不会去调你的方法。
     */
    @Select(
            """
            SELECT id AS orderLineId, line_no AS lineNo, sku_id AS skuId, title, quantity, shipped_qty AS shippedQty,
                   (quantity - shipped_qty - refunded_qty) AS remaining
              FROM trade.order_line
             WHERE seller_order_id = #{sellerOrderId}
             ORDER BY line_no
            """)
    List<TradeQuery.ShippableLine> findShippable(@Param("sellerOrderId") UUID sellerOrderId);

    /**
     * 售后要用的一行事实。
     *
     * <p>三张表 JOIN 是因为 buyer 在 group 上、merchant 在子单上、实付在行上——售后要一次拿全，
     * 分三次查中间可能夹进一次退款，算出来的上限就不对了。
     */
    default Optional<TradeQuery.RefundableLine> findRefundable(UUID orderLineId) {
        return findRefundableById(orderLineId);
    }

    /** 同一份事实，按 (子单, 行号) 查——买家端只知道自己看到的行号，不知道行 id。 */
    default Optional<TradeQuery.RefundableLine> findRefundable(UUID sellerOrderId, int lineNo) {
        return findRefundableByLineNo(sellerOrderId, lineNo);
    }

    /** 按 id 查的本体。MyBatis 的 statement 按方法名绑定，重载必须拆成不同名的方法。 */
    @Select(
            """
            SELECT l.id AS orderLineId, l.seller_order_id AS sellerOrderId, s.group_id AS orderGroupId,
                   s.merchant_id AS merchantId, s.shop_id AS shopId, g.buyer_id AS buyerId, g.currency, l.quantity,
                   l.refunded_qty AS refundedQty, l.payable_amount, l.refunded_amount AS refundedAmount
              FROM trade.order_line l
              JOIN trade.seller_order s ON s.id = l.seller_order_id
              JOIN trade.order_group g ON g.id = s.group_id
             WHERE l.id = #{orderLineId} AND g.payment_status = 'paid'
            """)
    Optional<TradeQuery.RefundableLine> findRefundableById(@Param("orderLineId") UUID orderLineId);

    /**
     * 按 (子单, 行号) 查的本体。
     *
     * <p>只认已付款的订单（和上面的按 id 查一致）：未付款的订单没有"退"可言，
     * 售后走到冻结那一步只会炸出一个 500。
     */
    @Select(
            """
            SELECT l.id AS orderLineId, l.seller_order_id AS sellerOrderId, s.group_id AS orderGroupId,
                   s.merchant_id AS merchantId, s.shop_id AS shopId, g.buyer_id AS buyerId, g.currency, l.quantity,
                   l.refunded_qty AS refundedQty, l.payable_amount, l.refunded_amount AS refundedAmount
              FROM trade.order_line l
              JOIN trade.seller_order s ON s.id = l.seller_order_id
              JOIN trade.order_group g ON g.id = s.group_id
             WHERE l.seller_order_id = #{sellerOrderId} AND l.line_no = #{lineNo} AND g.payment_status = 'paid'
            """)
    Optional<TradeQuery.RefundableLine> findRefundableByLineNo(
            @Param("sellerOrderId") UUID sellerOrderId, @Param("lineNo") int lineNo);

    /**
     * 加退款数量与金额。
     *
     * <p>两条上限都在 where 里：件数不超过 {@code quantity}，金额（含已取消部分）不超过 {@code payableAmount}。
     * 超了影响 0 行，调用方据此回滚——先查再改的窗口就是退多的窗口。
     */
    @Update(
            """
            UPDATE trade.order_line
               SET refunded_qty = refunded_qty + #{qty},
                   refunded_amount = refunded_amount + #{amount}
             WHERE id = #{orderLineId}
               AND refunded_qty + #{qty} <= quantity
               AND cancelled_amount + refunded_amount + #{amount} <= payable_amount
            """)
    boolean addRefunded(
            @Param("orderLineId") UUID orderLineId, @Param("qty") int quantity, @Param("amount") long amount);

    /**
     * 加发货数量。
     *
     * <p>条件里带 {@code shipped_qty + :qty <= quantity - refunded_qty}：发超了影响 0 行，
     * 调用方据此报错。已退的件不许再发——全额退款未发货的单，这里就是"钱货两得"的最后一道闸。
     */
    @Update(
            """
            UPDATE trade.order_line
               SET shipped_qty = shipped_qty + #{qty}
             WHERE seller_order_id = #{sellerOrderId} AND line_no = #{lineNo}
               AND shipped_qty + #{qty} <= quantity - refunded_qty
            """)
    boolean addShipped(
            @Param("sellerOrderId") UUID sellerOrderId, @Param("lineNo") int lineNo, @Param("qty") int quantity);

    /** 加签收数量。签收不能超过已发货量。 */
    @Update(
            """
            UPDATE trade.order_line
               SET received_qty = received_qty + #{qty}
             WHERE seller_order_id = #{sellerOrderId} AND line_no = #{lineNo} AND received_qty + #{qty} <= shipped_qty
            """)
    boolean addReceived(
            @Param("sellerOrderId") UUID sellerOrderId, @Param("lineNo") int lineNo, @Param("qty") int quantity);

    public record NewLine(
            UUID id,
            UUID sellerOrderId,
            int lineNo,
            UUID listingId,
            UUID skuId,
            UUID spuId,
            String currency,
            int quantity,
            long unitAmount,
            long subtotal,
            long discountAmount,
            long payableAmount,
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
