package com.shop.platform.product.api;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 商品只读查询（跨模块消费）：按主键 IN 点查本模块 schema 的投影列，交回 Map 供内存拼装。
 * 刻意不提供的能力：JOIN、按非键条件过滤、写——越界查询无处可写。
 */
@Component
@RequiredArgsConstructor
public class ProductReadQuery {

    private final JdbcTemplate jdbc;

    /** product.skus 按 ID 批查：展示快照与可用性字段，缺失的 id 不在 Map 中 */
    public Map<UUID, SkuView> skusByIds(Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return Map.of();
        }
        String placeholders = ids.stream().map(id -> "?").collect(Collectors.joining(","));
        return jdbc.query(
                "SELECT id, product_id, name, image, price, original_price, currency, status "
                        + "FROM product.skus WHERE id IN (" + placeholders + ")",
                rs -> {
                    Map<UUID, SkuView> map = new HashMap<>();
                    while (rs.next()) {
                        map.put(
                                rs.getObject("id", UUID.class),
                                new SkuView(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("product_id", UUID.class),
                                        rs.getString("name"),
                                        rs.getString("image"),
                                        rs.getObject("price", Long.class),
                                        rs.getObject("original_price", Long.class),
                                        rs.getString("currency"),
                                        rs.getObject("status", Integer.class)));
                    }
                    return map;
                },
                ids.toArray());
    }

    /** product.products 按 ID 批查：分组 shopId、卡片字段与上架状态，缺失的 id 不在 Map 中 */
    public Map<UUID, ProductView> productsByIds(Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return Map.of();
        }
        String placeholders = ids.stream().map(id -> "?").collect(Collectors.joining(","));
        return jdbc.query(
                "SELECT id, shop_id, name, main_image, min_price, max_price, status "
                        + "FROM product.products WHERE id IN (" + placeholders + ")",
                rs -> {
                    Map<UUID, ProductView> map = new HashMap<>();
                    while (rs.next()) {
                        map.put(
                                rs.getObject("id", UUID.class),
                                new ProductView(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("shop_id", UUID.class),
                                        rs.getString("name"),
                                        rs.getString("main_image"),
                                        rs.getObject("min_price", Long.class),
                                        rs.getObject("max_price", Long.class),
                                        rs.getObject("status", Integer.class)));
                    }
                    return map;
                },
                ids.toArray());
    }
}
