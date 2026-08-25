package com.shop.platform.order.api;

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
                                rs.getString("status"),
                                rs.getObject("pay_amount", Long.class),
                                rs.getString("currency")),
                        orderId)
                .stream()
                .findFirst();
    }
}
