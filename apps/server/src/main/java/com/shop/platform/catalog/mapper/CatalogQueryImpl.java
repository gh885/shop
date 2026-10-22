package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.api.CatalogQuery;
import com.shop.platform.common.money.Money;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 可售事实的点查。实现 {@link CatalogQuery}，因为它是 catalog 对外的只读入口。
 *
 * <p>一次 JOIN 拿全：SPU、SKU、online offer 三张表在同一个库同一个事务里，分开查只会多出竞态。
 */
@Component
public class CatalogQueryImpl implements CatalogQuery {

    /**
     * 只有 {@code offer.status = 'online'} 且 {@code sku.status = 'active'} 才算可售。
     *
     * <p>{@code fetch first 1 row only} 是因为一个 SPU 可能在多个店挂售，同一 SKU 就有多个 offer；
     * 买家点的是哪个店由 offer 决定，但算价只要一个确定的价——按 offer id 排序取第一个，
     * 保证同一请求多次算价结果一致。
     *
     * <p>主图取 {@code spu_media} 里第一条通用图（{@code attribute_id IS NULL}），按 {@code sort} 排。
     * 子查询而不是 JOIN：一个 SPU 有多张图，JOIN 会让结果集出现多行，
     * 而 {@code fetch first 1 row only} 会让"取哪张图"变成不确定的事。
     */
    private static final String FIND_SELLABLE =
            """
            SELECT k.id                AS sku_id,
                   s.id                AS spu_id,
                   o.id                AS offer_id,
                   o.merchant_id       AS merchant_id,
                   o.shop_id           AS shop_id,
                   s.category_id       AS category_id,
                   s.brand_id          AS brand_id,
                   s.title             AS title,
                   (SELECT m.url
                      FROM catalog.spu_media m
                     WHERE m.spu_id = s.id
                       AND m.attribute_id IS NULL
                       AND m.media_type = 'image'
                     ORDER BY m.sort, m.created_at
                     FETCH FIRST 1 ROW ONLY) AS image_url,
                   CAST(k.spec_values AS text) AS spec_values,
                   k.identity_key      AS identity_key,
                   k.price_amount      AS price_amount,
                   k.price_currency    AS price_currency,
                   k.weight_g          AS weight_g
              FROM catalog.sku k
              JOIN catalog.spu s   ON s.id = k.spu_id
              JOIN catalog.offer o ON o.spu_id = s.id AND o.status = 'online'
             WHERE k.id = :skuId AND k.status = 'active'
             ORDER BY o.id
             FETCH FIRST 1 ROW ONLY
            """;

    private final JdbcClient jdbc;

    public CatalogQueryImpl(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public Optional<SellableSku> findSellable(UUID skuId) {
        return jdbc.sql(FIND_SELLABLE)
                .param("skuId", skuId)
                .query((rs, row) -> new SellableSku(
                        rs.getObject("sku_id", UUID.class),
                        rs.getObject("spu_id", UUID.class),
                        rs.getObject("offer_id", UUID.class),
                        rs.getObject("merchant_id", UUID.class),
                        rs.getObject("shop_id", UUID.class),
                        rs.getObject("category_id", UUID.class),
                        rs.getObject("brand_id", UUID.class),
                        new Money(rs.getLong("price_amount"), rs.getString("price_currency")),
                        (Integer) rs.getObject("weight_g"),
                        rs.getString("title"),
                        rs.getString("image_url"),
                        rs.getString("spec_values"),
                        rs.getString("identity_key")))
                .optional();
    }
}
