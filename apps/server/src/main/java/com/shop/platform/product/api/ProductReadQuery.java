package com.shop.platform.product.api;

import com.shop.platform.common.Money;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.product.model.SkuStatus;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 商品只读查询（跨模块消费）：按主键 IN 点查本模块 schema 的投影列，交回 Map 供内存拼装。
 * 刻意不提供的能力：JOIN、按非键条件过滤、写——越界查询无处可写。
 */
@Component
@RequiredArgsConstructor
public class ProductReadQuery {

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate namedJdbc;

    /** product.skus 按 ID 批查：展示快照与可用性字段，缺失的 id 不在 Map 中 */
    public Map<UUID, SkuView> skusByIds(Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) return Map.of();
        return namedJdbc.query(
                "SELECT id, product_id, name, image, price, original_price, currency, status "
                        + "FROM product.skus WHERE id IN (:ids)",
                Map.of("ids", ids),
                rs -> {
                    Map<UUID, SkuView> skus = new HashMap<>();
                    while (rs.next()) {
                        SkuView sku = new SkuView(
                                rs.getObject("id", UUID.class),
                                rs.getObject("product_id", UUID.class),
                                rs.getString("name"),
                                rs.getString("image"),
                                money(rs, "price"),
                                money(rs, "original_price"),
                                SkuStatus.valueOf(rs.getString("status")));
                        skus.put(sku.id(), sku);
                    }
                    return skus;
                });
    }

    /** product.products 按 ID 批查：分组 shopId、卡片字段与上架状态，缺失的 id 不在 Map 中 */
    public Map<UUID, ProductView> productsByIds(Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) return Map.of();
        return namedJdbc.query(
                "SELECT id, shop_id, name, main_image, min_price, max_price, currency, status, seven_day_return "
                        + "FROM product.products WHERE id IN (:ids)",
                Map.of("ids", ids),
                rs -> {
                    Map<UUID, ProductView> products = new HashMap<>();
                    while (rs.next()) {
                        ProductView product = new ProductView(
                                rs.getObject("id", UUID.class),
                                rs.getObject("shop_id", UUID.class),
                                rs.getString("name"),
                                rs.getString("main_image"),
                                money(rs, "min_price"),
                                money(rs, "max_price"),
                                ProductStatus.valueOf(rs.getString("status")),
                                rs.getBoolean("seven_day_return"));
                        products.put(product.id(), product);
                    }
                    return products;
                });
    }

    /** 单个 SKU 点查（在售校验等单对象消费用），无行返回 empty —— api 包缺席语义统一走 Optional */
    public Optional<SkuView> skuById(UUID skuId) {
        return Optional.ofNullable(skusByIds(List.of(skuId)).get(skuId));
    }

    /** 单个 SPU 点查（上架校验等单对象消费用），无行返回 empty */
    public Optional<ProductView> productById(UUID productId) {
        return Optional.ofNullable(productsByIds(List.of(productId)).get(productId));
    }

    /** 金额列 + 本行 currency 列 → Money；金额列为 NULL（未定价、无划线价）时给 null 而不是 0 */
    private static Money money(ResultSet rs, String amountColumn) throws SQLException {
        return Money.ofFenOrNull(rs.getObject(amountColumn, Long.class), rs.getString("currency"));
    }
}
