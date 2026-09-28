package com.shop.platform.inventory.api;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 库存只读查询（跨模块消费）：按 SKU ID 批查本模块 schema 的投影列，交回 Map 供内存拼装。
 * 刻意不提供的能力：JOIN、按非键条件过滤、写——越界查询无处可写。
 */
@Component
@RequiredArgsConstructor
public class StockReadQuery {

    private final NamedParameterJdbcTemplate namedJdbc;

    /** 按 SKU ID 批查可用库存：购物车/结算/详情判定缺货与展示用，缺失的 id 不在 Map 中 */
    public Map<UUID, StockView> availableBySkuIds(Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) return Map.of();
        return namedJdbc.query(
                "SELECT sku_id, stock, frozen_stock FROM inventory.sku_stock WHERE sku_id IN (:ids)",
                Map.of("ids", ids),
                rs -> {
                    Map<UUID, StockView> stocks = new HashMap<>();
                    while (rs.next()) {
                        UUID skuId = rs.getObject("sku_id", UUID.class);
                        int stock = rs.getObject("stock", Integer.class);
                        int frozen = rs.getObject("frozen_stock", Integer.class);
                        stocks.put(skuId, new StockView(skuId, stock, stock - frozen));
                    }
                    return stocks;
                });
    }
}
