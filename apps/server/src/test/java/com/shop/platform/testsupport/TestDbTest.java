package com.shop.platform.testsupport;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 测试数据登记表单测。purge 的 LIFO 顺序是「先子后父」删除的保障——
 * 这个机制错了会静默污染 dev 库，值得钉死。全部用 mock JdbcTemplate 验证 SQL 序列。
 */
class TestDbTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);

    private final TestDb db = new TestDb(jdbc);

    @Test
    void purge_按登记逆序执行_先子后父() {
        // 登记顺序 = 插入顺序（父表在前）
        db.onDelete("DELETE FROM product.products WHERE id = ?::uuid", "p1");
        db.onDelete("DELETE FROM product.skus WHERE product_id = ?::uuid", "s1");

        db.purge();

        // 执行顺序必须反着来：skus 先删、products 后删
        InOrder lifo = inOrder(jdbc);
        lifo.verify(jdbc).update("DELETE FROM product.skus WHERE product_id = ?::uuid", "s1");
        lifo.verify(jdbc).update("DELETE FROM product.products WHERE id = ?::uuid", "p1");
    }

    @Test
    void purge_幂等可重入() {
        db.onDelete("DELETE FROM x WHERE id = ?::uuid", "1");

        db.purge();
        db.purge();

        verify(jdbc, times(1)).update(anyString(), any(Object[].class));
    }

    @Test
    void purge_空登记_不炸() {
        assertThatCode(() -> db.purge()).doesNotThrowAnyException();
    }

    @Test
    void seedOnSaleSku_INSERT顺序与清理顺序镜像() throws Exception {
        UUID skuId = db.seedOnSaleSku(UUID.randomUUID(), 1000L, 5);

        // 插入顺序：商品 → SKU → 库存主体（父前子后）
        InOrder inserts = inOrder(jdbc);
        inserts.verify(jdbc).update(contains("INSERT INTO product.products"), any(Object[].class));
        inserts.verify(jdbc).update(contains("INSERT INTO product.skus"), any(Object[].class));
        inserts.verify(jdbc).update(contains("INSERT INTO inventory.sku_stock"), any(Object[].class));

        // 清理必须严格镜像逆序：流水 → 库存 → SKU → 商品
        db.purge();
        InOrder cleanup = inOrder(jdbc);
        cleanup.verify(jdbc).update(contains("DELETE FROM inventory.stock_movements"), any(Object[].class));
        cleanup.verify(jdbc).update(contains("DELETE FROM inventory.sku_stock"), any(Object[].class));
        cleanup.verify(jdbc).update(contains("DELETE FROM product.skus"), any(Object[].class));
        cleanup.verify(jdbc).update(contains("DELETE FROM product.products"), any(Object[].class));

        // 库存行归属返回的 skuId：INSERT 参数 (行id, skuId, stock)
        verify(jdbc).update(contains("INSERT INTO inventory.sku_stock"), any(), eq(skuId.toString()), eq(5));
    }

    @Test
    void seedAddress_一条INSERT并登记清理() {
        UUID userId = UUID.randomUUID();

        UUID addressId = db.seedAddress(userId);

        verify(jdbc).update(contains("INSERT INTO account.addresses"), any(Object[].class));

        db.purge();
        verify(jdbc).update(contains("DELETE FROM account.addresses"), eq(addressId.toString()));
    }
}
