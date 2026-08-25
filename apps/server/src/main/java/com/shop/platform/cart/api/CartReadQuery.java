package com.shop.platform.cart.api;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 购物车只读查询（跨模块消费）：按主键 IN 点查本模块 schema 的投影列，禁止 JOIN 与写。
 */
@Component
@RequiredArgsConstructor
public class CartReadQuery {

    private final JdbcTemplate jdbc;

    /** 条目按 ID 批查：order 结算按 ID 点查后内存过滤归属，缺失的 id 不在 Map 中 */
    public Map<UUID, CartLineView> linesByIds(Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return Map.of();
        }
        String placeholders = ids.stream().map(id -> "?").collect(Collectors.joining(","));
        return jdbc.query(
                "SELECT id, user_id, sku_id, quantity FROM cart.items WHERE id IN (" + placeholders + ")",
                rs -> {
                    Map<UUID, CartLineView> map = new HashMap<>();
                    while (rs.next()) {
                        map.put(
                                rs.getObject("id", UUID.class),
                                new CartLineView(
                                        rs.getObject("user_id", UUID.class),
                                        rs.getObject("sku_id", UUID.class),
                                        rs.getInt("quantity")));
                    }
                    return map;
                },
                ids.toArray());
    }
}
