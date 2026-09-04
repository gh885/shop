package com.shop.platform.order.api;

import com.shop.platform.product.api.ProductSoldQuery;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 商品累计销量只读查询（跨模块消费）：按商品 SPU 批查已完成订单的成交量，交回 Map 供内存拼装。
 *
 * <p>口径：只统计 {@code status='COMPLETED'}（已完成 = 履约闭环、确认收货）的订单行项加总。
 * 待付款/待发货/已发货/已取消不计入——「累计销量」对卖家是「卖出去且买家确认收货」的量，
 * 待付款可能取消、已发货还没完成，都不算成交。退款是否回冲后续按业务口径再定，V1 先纯加总。
 *
 * <p>SQL 在 orders schema 内 JOIN（items → orders 带 shop_id 过滤），符合「同 schema 内查询，
 * 不对他方 schema JOIN」的模块边界。刻意不提供按非键条件过滤、写——越界查询无处可写。
 */
@Component
@RequiredArgsConstructor
public class ProductSoldReadQuery implements ProductSoldQuery {

    private final JdbcTemplate jdbc;

    /**
     * 按店铺批查各商品的累计已售数量：返回 productId → SUM(quantity)。
     * 缺失的商品（零销量/未返回）不在 Map 中，消费方按 0 兜底。
     */
    public Map<UUID, Long> soldCountByProductIds(UUID shopId, Collection<UUID> productIds) {
        if (productIds == null || productIds.isEmpty()) {
            return Map.of();
        }
        String placeholders = productIds.stream().map(id -> "?").collect(Collectors.joining(","));
        String sql =
                """
                SELECT i.product_id, SUM(i.quantity) AS sold
                FROM orders.items i
                JOIN orders.orders o ON o.id = i.order_id
                WHERE o.shop_id = ?
                  AND o.status = 'COMPLETED'
                  AND i.product_id IN (%s)
                GROUP BY i.product_id
                """
                        .formatted(placeholders);
        // shopId 与多个 productId 合并成一个 Object[]：JdbcTemplate.query 的可变参数（Object...）
        // 若直接写 (shopId, productIds.toArray())，后者会作为单个 Object[] 参数传给 PG，
        // PG 无法把数组整体绑定成 IN 的多个标量（SQLFeatureNotSupportedException）。合并后逐参数展开。
        Object[] args = new Object[productIds.size() + 1];
        args[0] = shopId;
        int i = 1;
        for (UUID pid : productIds) {
            args[i++] = pid;
        }
        return jdbc.query(
                sql,
                rs -> {
                    Map<UUID, Long> map = new HashMap<>();
                    while (rs.next()) {
                        map.put(rs.getObject("product_id", UUID.class), rs.getLong("sold"));
                    }
                    return map;
                },
                args);
    }
}
