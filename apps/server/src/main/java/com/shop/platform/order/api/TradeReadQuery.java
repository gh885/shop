package com.shop.platform.order.api;

import com.shop.platform.common.Money;
import com.shop.platform.order.model.TradeStatus;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 主订单只读查询（跨模块消费）：payment 支付前置校验与整批读单。
 *
 * <p>两个点查（主订单 + 其下子订单）收在本模块 api 包，消费方不碰 orders schema 的表名；
 * 不 JOIN、不做非键过滤、不写。
 */
@Component
@RequiredArgsConstructor
public class TradeReadQuery {

    private final JdbcTemplate jdbc;

    /** 主订单支付视图：含全部子订单的应付明细；查无此单返回 empty */
    public Optional<TradePaymentView> paymentViewById(UUID tradeId) {
        return jdbc
                .query(
                        "SELECT id, trade_no, user_id, status, pay_amount, currency FROM orders.trades WHERE id = ?",
                        (rs, i) -> new TradePaymentView(
                                rs.getObject("id", UUID.class),
                                rs.getString("trade_no"),
                                rs.getObject("user_id", UUID.class),
                                TradeStatus.valueOf(rs.getString("status")),
                                money(rs, "pay_amount"),
                                List.of()),
                        tradeId)
                .stream()
                .findFirst()
                .map(view -> new TradePaymentView(
                        view.tradeId(),
                        view.tradeNo(),
                        view.userId(),
                        view.status(),
                        view.payAmount(),
                        lines(view.tradeId())));
    }

    /** 子订单所属主订单：单笔支付/退款监听只知道订单时的反查入口 */
    public Optional<UUID> tradeIdByOrderId(UUID orderId) {
        return jdbc
                .query(
                        "SELECT trade_id FROM orders.orders WHERE id = ?",
                        (rs, i) -> rs.getObject("trade_id", UUID.class),
                        orderId)
                .stream()
                .findFirst();
    }

    private List<TradePaymentView.TradePaymentLine> lines(UUID tradeId) {
        return jdbc.query(
                "SELECT id, order_no, pay_amount, currency FROM orders.orders WHERE trade_id = ? ORDER BY shop_id",
                (rs, i) -> new TradePaymentView.TradePaymentLine(
                        rs.getObject("id", UUID.class), rs.getString("order_no"), money(rs, "pay_amount")),
                tradeId);
    }

    private static Money money(ResultSet rs, String amountColumn) throws SQLException {
        return Money.ofFenOrNull(rs.getObject(amountColumn, Long.class), rs.getString("currency"));
    }
}
