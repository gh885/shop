package com.shop.platform.infra.observability;

import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 应用内数据对账：把 {@code pnpm health:scan} 的只读检查搬到生产定时执行。
 *
 * <p>技术指标全绿、钱或库存却对不上的故障只有对账能发现。每项检查返回不一致的样本数，
 * 大于 0 就打一条 {@code reconcile.mismatch} 事件（带 check 与 count），生产告警按 event 聚合。
 * 单项 SQL 失败不打断其余检查，只留 error 日志，下一轮重试。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReconcileJob {

    private final JdbcTemplate jdbcTemplate;

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
                    "超时待付款订单",
                    """
                    SELECT COUNT(*) FROM (
                      SELECT id FROM orders.orders
                      WHERE status = 'PENDING_PAYMENT' AND created_at < now() - interval '30 minutes'
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
                      WHERE o.status IN ('PAID', 'SHIPPED', 'COMPLETED')
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
                    "冻结库存与待付款单数量不一致",
                    """
                    SELECT CASE WHEN frozen.qty <> pending.qty THEN 1 ELSE 0 END
                    FROM (
                      SELECT COALESCE(SUM(oi.quantity), 0) AS qty
                      FROM orders.orders o
                      JOIN orders.items oi ON oi.order_id = o.id
                      WHERE o.status = 'PENDING_PAYMENT'
                    ) pending, (
                      SELECT COALESCE(SUM(frozen_stock), 0) AS qty
                      FROM inventory.sku_stock
                    ) frozen
                    """));

    @Scheduled(cron = "${shop.reconcile.cron:0 15 3 * * *}")
    public void run() {
        for (Check check : CHECKS) {
            try {
                Integer mismatches = jdbcTemplate.queryForObject(check.countSql(), Integer.class);
                if (mismatches != null && mismatches > 0) {
                    BizEvent.of("reconcile.mismatch")
                            .put("check", check.name())
                            .put("count", mismatches)
                            .warn();
                }
            } catch (RuntimeException ex) {
                log.error("[RECONCILE] 检查执行失败, check={}", check.name(), ex);
            }
        }
    }
}
