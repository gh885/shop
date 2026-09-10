package com.shop.platform.order.api;

import com.shop.platform.order.model.OrderStatus;
import java.time.OffsetDateTime;
import java.util.List;
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
                                rs.getObject("pay_amount", Long.class),
                                rs.getString("currency")),
                        orderId)
                .stream()
                .findFirst();
    }

    /** 单笔订单的售后视图：aftersale 申请前置校验（归属 / 已完成 / 窗口未过）与退款口径，查无此单返回 empty */
    public Optional<OrderAfterSaleView> afterSaleViewById(UUID orderId) {
        return jdbc
                .query(
                        "SELECT user_id, shop_id, status, apply_expire_at, pay_amount, currency FROM orders.orders WHERE id = ?",
                        (rs, i) -> new OrderAfterSaleView(
                                rs.getObject("user_id", UUID.class),
                                rs.getObject("shop_id", UUID.class),
                                OrderStatus.valueOf(rs.getString("status")),
                                rs.getObject("apply_expire_at", OffsetDateTime.class),
                                rs.getObject("pay_amount", Long.class),
                                rs.getString("currency")),
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

    /** 订单行项（SKU + 件数）：aftersale 退货收货回补库存用 */
    public List<OrderLineView> linesById(UUID orderId) {
        return jdbc.query(
                "SELECT sku_id, quantity FROM orders.items WHERE order_id = ?",
                (rs, i) -> new OrderLineView(rs.getObject("sku_id", UUID.class), rs.getInt("quantity")),
                orderId);
    }
}
