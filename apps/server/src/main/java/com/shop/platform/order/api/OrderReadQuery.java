package com.shop.platform.order.api;

import com.shop.platform.common.Money;
import com.shop.platform.infra.db.IdBatchReader;
import com.shop.platform.order.model.OrderStatus;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 订单只读查询（跨模块消费）：按主键点查本模块 schema 的投影列。
 * 禁止 JOIN、按非键条件过滤、写——越界查询无处可写。
 */
@Component
@RequiredArgsConstructor
public class OrderReadQuery {

    private final JdbcTemplate jdbc;

    /** 单笔订单的支付视图：payment 模块支付前置校验用，查无此单返回 empty */
    public Optional<OrderPaymentView> paymentViewById(UUID orderId) {
        return jdbc
                .query(
                        "SELECT order_no, user_id, status, pay_amount, currency FROM orders.orders WHERE id = ?",
                        (rs, i) -> new OrderPaymentView(
                                rs.getString("order_no"),
                                rs.getObject("user_id", UUID.class),
                                // DB 存枚举 name()（varchar + 默认 EnumTypeHandler），这里按契约还原
                                OrderStatus.valueOf(rs.getString("status")),
                                money(rs, "pay_amount")),
                        orderId)
                .stream()
                .findFirst();
    }

    /** 单笔订单的售后视图：aftersale 申请前置校验（归属 / 已完成 / 窗口未过）、退款口径与无理由窗口起算，查无此单返回 empty */
    public Optional<OrderAfterSaleView> afterSaleViewById(UUID orderId) {
        return jdbc
                .query(
                        "SELECT user_id, shop_id, status, apply_expire_at, pay_amount, currency, delivered_at, completed_at "
                                + "FROM orders.orders WHERE id = ?",
                        (rs, i) -> new OrderAfterSaleView(
                                rs.getObject("user_id", UUID.class),
                                rs.getObject("shop_id", UUID.class),
                                OrderStatus.valueOf(rs.getString("status")),
                                rs.getObject("apply_expire_at", OffsetDateTime.class),
                                money(rs, "pay_amount"),
                                rs.getObject("delivered_at", OffsetDateTime.class),
                                rs.getObject("completed_at", OffsetDateTime.class)),
                        orderId)
                .stream()
                .findFirst();
    }

    /** 单笔订单的发货视图：logistics 发货前置校验（归属 / 可否再发货），查无此单返回 empty */
    public Optional<OrderShipmentView> shipmentViewById(UUID orderId) {
        return jdbc
                .query(
                        "SELECT user_id, shop_id, status FROM orders.orders WHERE id = ?",
                        (rs, i) -> new OrderShipmentView(
                                orderId,
                                rs.getObject("user_id", UUID.class),
                                rs.getObject("shop_id", UUID.class),
                                OrderStatus.valueOf(rs.getString("status"))),
                        orderId)
                .stream()
                .findFirst();
    }

    /** 订单行项（SKU + 件数 + 无理由退货声明快照）：aftersale 回补库存与判七天无理由强制用 */
    public List<OrderLineView> linesById(UUID orderId) {
        return jdbc.query(
                "SELECT sku_id, quantity, seven_day_return FROM orders.items WHERE order_id = ?",
                (rs, i) -> new OrderLineView(
                        rs.getObject("sku_id", UUID.class), rs.getInt("quantity"), rs.getBoolean("seven_day_return")),
                orderId);
    }

    /**
     * 一批订单的摘要：跨模块列表拼装用（卖家售后工作台列本店售后单时补订单号/买家/商品）。
     *
     * <p>仍是按主键 IN 的点查——不做非键过滤、不 JOIN 他方 schema；行项计数与首个商品名是同一 schema 内的
     * 子查询（orders.items 属本模块）。缺失的 id 不在 Map 中，由调用方决定怎么面对。
     */
    public Map<UUID, OrderSummaryView> summariesByIds(Collection<UUID> ids) {
        return IdBatchReader.byIds(
                jdbc,
                """
                SELECT o.id, o.order_no, o.receiver_name,
                       (SELECT count(*) FROM orders.items i WHERE i.order_id = o.id) AS item_count,
                       (SELECT i.name FROM orders.items i WHERE i.order_id = o.id
                         ORDER BY i.created_at, i.id LIMIT 1) AS first_item_name
                FROM orders.orders o
                WHERE o.id IN (:ids)
                """,
                ids,
                (rs, i) -> rs.getObject("id", UUID.class),
                (rs, i) -> new OrderSummaryView(
                        rs.getObject("id", UUID.class),
                        rs.getString("order_no"),
                        rs.getString("receiver_name"),
                        rs.getLong("item_count"),
                        rs.getString("first_item_name")));
    }

    /** 金额列 + 本行 currency 列 → Money */
    private static Money money(ResultSet rs, String amountColumn) throws SQLException {
        return Money.ofFenOrNull(rs.getObject(amountColumn, Long.class), rs.getString("currency"));
    }
}
