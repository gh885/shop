package com.shop.platform.infra.db;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 跨 schema 只读对账探针：把 {@code pnpm health:scan} 的口径搬到生产定时执行。
 *
 * <p>为什么落在这里：这些检查直查多张跨模块的表（coupon/account/orders/payment/inventory…），
 * 属于「跨 schema 裸 SQL」，按 {@code NamingRulesTest} 只允许出现在 {@code infra.db} 与各模块 api 包。
 * 谁调度、发现差异后打什么事件，是 observability 关心的事，不进这一层。
 *
 * <p>单项 SQL 失败不打断其余检查：留 error 日志、返回该项为空，下一轮重试。
 */
@Component
@RequiredArgsConstructor
public class ReconcileProbe {

    private static final Logger log = LoggerFactory.getLogger(ReconcileProbe.class);

    /** 一条对账差异：检查名 + 不一致样本数（恒 > 0）。 */
    public record Mismatch(String check, int count) {}

    private record Check(String name, String countSql) {}

    private static final List<Check> CHECKS = List.of(
            new Check(
                    "孤立用户券",
                    """
                    SELECT COUNT(*) FROM (
                      SELECT c.id FROM coupon.user_coupons c
                      LEFT JOIN account.users u ON u.id = c.user_id
                      LEFT JOIN shop.shops s ON s.id = c.shop_id
                      WHERE u.id IS NULL OR s.id IS NULL
                    ) t
                    """),
            new Check(
                    "锁定超时用户券",
                    """
                    SELECT COUNT(*) FROM (
                      SELECT id FROM coupon.user_coupons
                      WHERE status = 'LOCKED' AND locked_at < now() - interval '30 minutes'
                    ) t
                    """),
            new Check(
                    "超时待付款主订单",
                    """
                    SELECT COUNT(*) FROM (
                      SELECT id FROM orders.trades
                      WHERE status = 'PENDING_PAYMENT' AND pay_expire_at < now() - interval '30 minutes'
                    ) t
                    """),
            new Check(
                    "在架但无可售库存的商品",
                    """
                    SELECT COUNT(*) FROM (
                      SELECT p.id FROM product.products p
                      WHERE p.status = 'PUBLISHED'
                        AND NOT EXISTS (
                          SELECT 1 FROM product.skus s
                          LEFT JOIN inventory.sku_stock st ON st.sku_id = s.id
                          WHERE s.product_id = p.id
                            AND s.status = 'ON_SALE'
                            AND COALESCE(st.stock, 0) - COALESCE(st.frozen_stock, 0) > 0
                        )
                    ) t
                    """),
            new Check(
                    "已付款订单缺成功支付流水",
                    """
                    SELECT COUNT(*) FROM (
                      SELECT o.id FROM orders.orders o
                      LEFT JOIN payment.payments p ON p.order_id = o.id AND p.status = 'SUCCESS'
                      WHERE o.paid_at IS NOT NULL
                        AND o.status IN ('PAID', 'PARTIALLY_SHIPPED', 'SHIPPED', 'COMPLETED')
                        AND p.id IS NULL
                    ) t
                    """),
            new Check(
                    "成功支付流水缺对应订单",
                    """
                    SELECT COUNT(*) FROM (
                      SELECT p.id FROM payment.payments p
                      LEFT JOIN orders.orders o ON o.id = p.order_id
                      WHERE p.status = 'SUCCESS' AND o.id IS NULL
                    ) t
                    """),
            new Check(
                    "成功支付金额与订单应付不一致",
                    """
                    SELECT COUNT(*) FROM (
                      SELECT p.id FROM payment.payments p
                      JOIN orders.orders o ON o.id = p.order_id
                      WHERE p.status = 'SUCCESS'
                        AND (p.amount <> o.pay_amount OR p.currency <> o.currency)
                    ) t
                    """),
            new Check(
                    "冻结库存与待支付主订单数量不一致",
                    """
                    SELECT CASE WHEN frozen.qty <> pending.qty THEN 1 ELSE 0 END
                    FROM (
                      SELECT COALESCE(SUM(oi.quantity), 0) AS qty
                      FROM orders.trades t
                      JOIN orders.orders o ON o.trade_id = t.id
                      JOIN orders.items oi ON oi.order_id = o.id
                      WHERE t.status = 'PENDING_PAYMENT'
                    ) pending, (
                      SELECT COALESCE(SUM(frozen_stock), 0) AS qty
                      FROM inventory.sku_stock
                    ) frozen
                    """));

    private final JdbcTemplate jdbcTemplate;

    /** 跑完全部检查，返回发现差异的项（count 恒 > 0）。全绿时返回空表。 */
    public List<Mismatch> findMismatches() {
        List<Mismatch> mismatches = new ArrayList<>();
        for (Check check : CHECKS) {
            try {
                Optional.ofNullable(jdbcTemplate.queryForObject(check.countSql(), Integer.class))
                        .filter(count -> count > 0)
                        .ifPresent(count -> mismatches.add(new Mismatch(check.name(), count)));
            } catch (RuntimeException ex) {
                log.error("[RECONCILE] 检查执行失败, check={}", check.name(), ex);
            }
        }
        return mismatches;
    }
}
