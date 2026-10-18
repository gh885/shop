package com.shop.platform.order.api;

import com.shop.platform.common.Money;
import com.shop.platform.order.model.OrderStatus;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 订单只读查询（跨模块消费）：按主键点查本模块 schema 的投影列。
 * 禁止 JOIN、按非键条件过滤、写——越界查询无处可写。
 */
@Component
@RequiredArgsConstructor
public class OrderReadQuery {

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate namedJdbc;

    /**
     * 单笔订单的退款视图：aftersale 发起/校验退款时的全部订单侧事实——归属、窗口、实付/运费/已退。
     * 查无此单返回 empty。
     */
    public Optional<OrderRefundView> refundViewById(UUID orderId) {
        return jdbc
                .query(
                        "SELECT trade_id, user_id, shop_id, order_no, status, pay_amount, shipping_fee, "
                                + "refunded_amount, compensated_amount, currency, apply_expire_at, delivered_at, completed_at "
                                + "FROM orders.orders WHERE id = ?",
                        (rs, i) -> new OrderRefundView(
                                orderId,
                                rs.getObject("trade_id", UUID.class),
                                rs.getObject("user_id", UUID.class),
                                rs.getObject("shop_id", UUID.class),
                                rs.getString("order_no"),
                                OrderStatus.valueOf(rs.getString("status")),
                                money(rs, "pay_amount"),
                                money(rs, "shipping_fee"),
                                money(rs, "refunded_amount"),
                                money(rs, "compensated_amount"),
                                rs.getObject("apply_expire_at", OffsetDateTime.class),
                                rs.getObject("delivered_at", OffsetDateTime.class),
                                rs.getObject("completed_at", OffsetDateTime.class)),
                        orderId)
                .stream()
                .findFirst();
    }

    /**
     * 订单行的退款账本（行主键 + 购买/已发/已退数量 + 行实付/已退金额）：aftersale 算行金额与数量上限的唯一输入。
     *
     * <p>按订单点查、不 JOIN、不跨 schema——「这一行还能退几件、该退多少钱」完全由 orders.items 的账本列回答，
     * 运费另在 {@link OrderRefundView} 上（子订单级，只整单退满时退一次）。
     */
    public List<OrderRefundLineView> refundLinesById(UUID orderId) {
        return jdbc.query(
                "SELECT id, name, sku_id, quantity, shipped_quantity, refunded_quantity, goods_paid_amount, "
                        + "refunded_amount, currency, seven_day_return FROM orders.items WHERE order_id = ? "
                        + "ORDER BY created_at, id",
                (rs, i) -> new OrderRefundLineView(
                        rs.getObject("id", UUID.class),
                        rs.getString("name"),
                        rs.getObject("sku_id", UUID.class),
                        rs.getInt("quantity"),
                        rs.getInt("shipped_quantity"),
                        rs.getInt("refunded_quantity"),
                        Money.ofFen(rs.getLong("goods_paid_amount"), rs.getString("currency")),
                        Money.ofFen(rs.getLong("refunded_amount"), rs.getString("currency")),
                        rs.getBoolean("seven_day_return")),
                orderId);
    }

    /** 单笔订单的发货视图：logistics 发货前置校验（归属 / 是否已付款 / 可否再发货），查无此单返回 empty */
    public Optional<OrderShipmentView> shipmentViewById(UUID orderId) {
        return jdbc
                .query(
                        "SELECT user_id, shop_id, status, paid_at FROM orders.orders WHERE id = ?",
                        (rs, i) -> new OrderShipmentView(
                                orderId,
                                rs.getObject("user_id", UUID.class),
                                rs.getObject("shop_id", UUID.class),
                                OrderStatus.valueOf(rs.getString("status")),
                                rs.getObject("paid_at", OffsetDateTime.class)),
                        orderId)
                .stream()
                .findFirst();
    }

    /**
     * 订单行的发货账本（行主键 + 购买量 + 已发 / 已结清量）：logistics 录单与交寄时的行级守卫读它。
     *
     * <p>按订单点查、不 JOIN、不跨 schema——发货守卫要判断的「这行还能发几件」由 {@code settled_quantity}
     * 回答，而它归本模块所有（§8）。
     */
    public List<OrderShipmentLineView> shipmentLinesById(UUID orderId) {
        return jdbc.query(
                "SELECT id, quantity, shipped_quantity, settled_quantity FROM orders.items WHERE order_id = ? "
                        + "ORDER BY created_at, id",
                (rs, i) -> new OrderShipmentLineView(
                        rs.getObject("id", UUID.class),
                        rs.getInt("quantity"),
                        rs.getInt("shipped_quantity"),
                        rs.getInt("settled_quantity")),
                orderId);
    }

    /**
     * 订单的评价素材（review 模块消费）：归属、状态、完成时刻与逐行商品快照。
     *
     * <p>两个点查（orders.orders 与 orders.items）串成一份素材，都在本模块 schema 内、不 JOIN：
     * 评价行要引用 order_item_id 与商品快照，而那些列只有本模块有。
     * 评价窗口不在这里算（那是 review 域的规则，见该视图注释），这里只给完成时刻这个事实。
     */
    public Optional<OrderReviewSourceView> reviewSourceById(UUID orderId) {
        return jdbc
                .query(
                        "SELECT user_id, shop_id, order_no, status, completed_at FROM orders.orders WHERE id = ?",
                        (rs, i) -> new OrderReviewSourceView(
                                orderId,
                                rs.getObject("user_id", UUID.class),
                                rs.getObject("shop_id", UUID.class),
                                rs.getString("order_no"),
                                OrderStatus.valueOf(rs.getString("status")),
                                rs.getObject("completed_at", OffsetDateTime.class),
                                List.of()),
                        orderId)
                .stream()
                .findFirst()
                .map(view -> {
                    List<OrderReviewSourceView.ReviewSourceLine> lines = jdbc.query(
                            "SELECT id, product_id, sku_id, name, image FROM orders.items WHERE order_id = ? "
                                    + "ORDER BY created_at, id",
                            (rs, i) -> new OrderReviewSourceView.ReviewSourceLine(
                                    rs.getObject("id", UUID.class),
                                    rs.getObject("product_id", UUID.class),
                                    rs.getObject("sku_id", UUID.class),
                                    rs.getString("name"),
                                    rs.getString("image")),
                            orderId);
                    return new OrderReviewSourceView(
                            view.orderId(),
                            view.userId(),
                            view.shopId(),
                            view.orderNo(),
                            view.status(),
                            view.completedAt(),
                            lines);
                });
    }

    /**
     * 一批订单的摘要：跨模块列表拼装用（卖家售后工作台列本店售后单时补订单号/买家/商品）。
     *
     * <p>仍是按主键 IN 的点查——不做非键过滤、不 JOIN 他方 schema；行项计数与首个商品名是同一 schema 内的
     * 子查询（orders.items 属本模块）。缺失的 id 不在 Map 中，由调用方决定怎么面对。
     */
    public Map<UUID, OrderSummaryView> summariesByIds(Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) return Map.of();
        return namedJdbc.query(
                """
                SELECT o.id, o.order_no, t.receiver_name,
                       (SELECT count(*) FROM orders.items i WHERE i.order_id = o.id) AS item_count,
                       (SELECT i.name FROM orders.items i WHERE i.order_id = o.id
                         ORDER BY i.created_at, i.id LIMIT 1) AS first_item_name
                FROM orders.orders o
                JOIN orders.trades t ON t.id = o.trade_id
                WHERE o.id IN (:ids)
                """,
                Map.of("ids", ids),
                rs -> {
                    Map<UUID, OrderSummaryView> summaries = new HashMap<>();
                    while (rs.next()) {
                        summaries.put(
                                rs.getObject("id", UUID.class),
                                new OrderSummaryView(
                                        rs.getObject("id", UUID.class),
                                        rs.getString("order_no"),
                                        rs.getString("receiver_name"),
                                        rs.getLong("item_count"),
                                        rs.getString("first_item_name")));
                    }
                    return summaries;
                });
    }

    /** 金额列 + 本行 currency 列 → Money */
    private static Money money(ResultSet rs, String amountColumn) throws SQLException {
        return Money.ofFenOrNull(rs.getObject(amountColumn, Long.class), rs.getString("currency"));
    }
}
