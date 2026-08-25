package com.shop.platform.testsupport;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 真库集成测试的数据登记表：谁建的数谁登记，结束统一清。
 *
 * <p>用法：种子数据走 {@code seedXxx}（自动登记清理）；service 调用产生的数据在建出后立即
 * {@link #onDelete} 登记（按自有 ID/UUID 圈定）。{@link #purge()} 由
 * {@link IntegrationTestSupport} 在 {@code @AfterEach} 调用，按登记逆序执行——所以
 * <b>登记顺序 = 插入顺序（父表在前）</b>，逆序删除天然先子后父。删除幂等，重复登记无害。
 *
 * <p>不用 {@code @Transactional} 回滚：AFTER_COMMIT 监听、Modulith outbox 登记这类
 * 提交期行为只有在真提交下才验得到，回滚反而制造假绿。
 */
public final class TestDb {

    private record Cleanup(String sql, Object[] args) {}

    private final JdbcTemplate jdbc;

    private final Deque<Cleanup> cleanups = new ArrayDeque<>();

    public TestDb(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 登记一条清理 DELETE（登记顺序 = 插入顺序，父表在前；purge 时逆序执行）。 */
    public void onDelete(String sql, Object... args) {
        cleanups.addLast(new Cleanup(sql, args));
    }

    /** AfterEach 统一入口：逆序执行所有登记的删除（幂等，行不在则删 0 行）。 */
    public void purge() {
        var c = cleanups.pollLast();
        while (c != null) {
            jdbc.update(c.sql(), c.args());
            c = cleanups.pollLast();
        }
    }

    // ========== 常用种子（自动登记清理） ==========

    /**
     * 在售商品（草稿类目占位）+ 单 SKU（priceFen 分，CNY）+ inventory 库存行（stock 件，无冻结）。
     *
     * @return skuId
     */
    public UUID seedOnSaleSku(UUID shopId, long priceFen, int stock) {
        UUID productId = UUID.randomUUID();
        UUID skuId = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO product.products (id, shop_id, category_id, name, status) VALUES (?::uuid, ?::uuid, ?::uuid, '测试商品', 1)",
                productId.toString(),
                shopId.toString(),
                UUID.randomUUID().toString());
        jdbc.update(
                "INSERT INTO product.skus (id, product_id, name, price, currency, status) VALUES (?::uuid, ?::uuid, '测试SKU', ?, 'CNY', 1)",
                skuId.toString(),
                productId.toString(),
                priceFen);
        jdbc.update(
                "INSERT INTO inventory.sku_stock (id, sku_id, stock, frozen_stock) VALUES (?::uuid, ?::uuid, ?, 0)",
                UUID.randomUUID().toString(),
                skuId.toString(),
                stock);
        onDelete("DELETE FROM product.products WHERE id = ?::uuid", productId.toString());
        onDelete("DELETE FROM product.skus WHERE product_id = ?::uuid", productId.toString());
        onDelete("DELETE FROM inventory.sku_stock WHERE sku_id = ?::uuid", skuId.toString());
        onDelete("DELETE FROM inventory.stock_movements WHERE sku_id = ?::uuid", skuId.toString());
        return skuId;
    }

    /** 测试收货地址（北京市朝阳区占位），返回地址 id。 */
    public UUID seedAddress(UUID userId) {
        UUID addressId = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO user_profile.addresses (id, user_id, receiver_name, phone, region_code, province, city, district, detail) "
                        + "VALUES (?::uuid, ?::uuid, '张三', '13800000000', '110100', '北京市', '北京市', '朝阳区', '测试路 1 号')",
                addressId.toString(),
                userId.toString());
        onDelete("DELETE FROM user_profile.addresses WHERE id = ?::uuid", addressId.toString());
        return addressId;
    }
}
