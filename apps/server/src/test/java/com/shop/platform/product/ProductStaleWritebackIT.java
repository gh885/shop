package com.shop.platform.product;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.ProductMapper;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 整行回写不得撤销并发的治理动作（真库，串行即可复现）。
 *
 * <p>场景：卖家打开编辑页读到 PUBLISHED，同一时刻平台停业级联把该店商品下架（条件更新），卖家再点保存。
 * 保存走 {@code updateById} 整行回写，手里的实体还是 PUBLISHED——若 status 列随整行回写，下架就被静默撤销。
 * 这是丢失更新的「第二写者」形状（docs/adr/0001），与 soldCount 同一个坑；修法是 status 标
 * {@code updateStrategy = NEVER}，状态只经 mapper 条件更新改。
 *
 * <p>不必起线程：窗口里发生了什么是确定的（读 → 别人改 → 我写回），把三步串行摆出来就是那个窗口。
 */
@SpringBootTest
class ProductStaleWritebackIT extends IntegrationTestSupport {

    @Autowired
    private ProductMapper productMapper;

    private final UUID shopId = UUID.randomUUID();

    private String statusOf(UUID productId) {
        return jdbc.queryForObject(
                "SELECT status FROM product.products WHERE id = ?::uuid", String.class, productId.toString());
    }

    private String nameOf(UUID productId) {
        return jdbc.queryForObject(
                "SELECT name FROM product.products WHERE id = ?::uuid", String.class, productId.toString());
    }

    @Test
    void 卖家编辑的整行回写_不撤销并发的平台下架() {
        UUID skuId = db.seedOnSaleSku(shopId, 1000, 5);
        UUID productId = db.productIdOfSku(skuId);

        // 1. 卖家打开编辑页：读到在架
        Product stale = productMapper.selectById(productId);
        assertEquals(ProductStatus.PUBLISHED, stale.getStatus());

        // 2. 同一时刻平台停业级联下架（条件更新 PUBLISHED → WAREHOUSE）
        assertEquals(1, productMapper.takedownPublished(shopId, OffsetDateTime.now()));
        assertEquals("WAREHOUSE", statusOf(productId));

        // 3. 卖家点保存：整行回写，手里的 status 还是 PUBLISHED
        stale.setName("改过名的商品");
        productMapper.updateById(stale);

        // 编辑本身要落下去，但下架不能被撤销
        assertEquals("改过名的商品", nameOf(productId));
        assertEquals("WAREHOUSE", statusOf(productId), "整行回写把读到的旧状态写回去了：平台下架被卖家的编辑撤销");
    }
}
