package com.shop.platform.product;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ShopIdHolder;
import com.shop.platform.product.dto.SkuUpdateItem;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.mapper.SpecItem;
import com.shop.platform.product.service.ProductService;
import com.shop.platform.product.service.ProductService.CreateProductCommand;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** 四步流程集成验证：create → updateSpecs（对账保留）→ updateSku → publish。基于 V5 种子类目数据。 */
@SpringBootTest
class ProductIT extends IntegrationTestSupport {

    /** V5 种子数据里的三级类目「手机」 */
    private static final UUID SEED_CATEGORY = UUID.fromString("01900000-0000-7000-8000-000000000301");

    @Autowired
    private ProductService productService;

    /**
     * 接口变更后 shopId 不再由调用方传入，而是来自店铺上下文（X-Shop-Id）。测试直接操作 service，手动落上下文。
     * 自建自清：按 shopId 圈定商品与 SKU（先父后子登记，purge 逆序执行）。
     */
    private Product createDraft(String name) {
        UUID shopId = UUID.randomUUID();
        ShopIdHolder.set(shopId);
        db.onDelete("DELETE FROM product.products WHERE shop_id = ?::uuid", shopId.toString());
        db.onDelete(
                "DELETE FROM product.skus WHERE product_id IN (SELECT id FROM product.products WHERE shop_id = ?::uuid)",
                shopId.toString());
        return productService.create(
                new CreateProductCommand(shopId, SEED_CATEGORY, name, null, null, null, List.of(), List.of()));
    }

    @AfterEach
    void clearShopContext() {
        ShopIdHolder.clear();
    }

    @Test
    void 全流程_规格对账_发布聚合价() {
        Product draft = createDraft("四步流程测试机");

        // 1. 定义 颜色(黑,白) × 尺码(S,M,L)，生成 6 个 SKU
        List<Sku> six = productService.updateSpecs(
                draft.getId(),
                List.of(new SpecItem("颜色", List.of("黑", "白")), new SpecItem("尺码", List.of("S", "M", "L"))));
        assertEquals(6, six.size());

        // 2. 给 6 个 SKU 填价 100
        List<SkuUpdateItem> priceAll = six.stream()
                .map(s -> new SkuUpdateItem(s.getId(), null, null, 100L, null, 10, null, null))
                .toList();
        productService.updateSkus(draft.getId(), priceAll);

        // 3. 加一个颜色 → 对账：原 6 个保留价格，新增 3 个（红）价格为空
        List<Sku> nine = productService.updateSpecs(
                draft.getId(),
                List.of(new SpecItem("颜色", List.of("黑", "白", "红")), new SpecItem("尺码", List.of("S", "M", "L"))));
        assertEquals(9, nine.size());
        long keptPriced = nine.stream().filter(s -> s.getPrice() != null).count();
        assertEquals(6, keptPriced);

        // 4. 给新增 3 个填价 300
        List<SkuUpdateItem> priceNew = nine.stream()
                .filter(s -> s.getPrice() == null)
                .map(s -> new SkuUpdateItem(s.getId(), null, null, 300L, null, 5, null, null))
                .toList();
        assertEquals(3, priceNew.size());
        productService.updateSkus(draft.getId(), priceNew);

        // 5. 发布：状态上架，min/max 聚合 100..300
        Product published = productService.publish(draft.getId());
        assertEquals(1, published.getStatus());
        assertEquals(100L, published.getMinPrice());
        assertEquals(300L, published.getMaxPrice());
    }

    @Test
    void 发布_存在未设价SKU_400() {
        Product draft = createDraft("未设价草稿");
        productService.updateSpecs(draft.getId(), List.of(new SpecItem("颜色", List.of("黑", "白"))));

        BusinessException ex = assertThrows(BusinessException.class, () -> productService.publish(draft.getId()));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    void 上架态改规格_409() {
        Product draft = createDraft("已上架草稿");
        List<Sku> skus = productService.updateSpecs(draft.getId(), List.of(new SpecItem("颜色", List.of("黑"))));
        productService.updateSkus(
                draft.getId(),
                List.of(new SkuUpdateItem(skus.getFirst().getId(), null, null, 100L, null, 1, null, null)));
        productService.publish(draft.getId());

        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> productService.updateSpecs(draft.getId(), List.of(new SpecItem("颜色", List.of("白")))));
        assertEquals(409, ex.getHttpStatus());
    }

    @Test
    void 下架改规格_重上架复检门槛() {
        Product draft = createDraft("上下架状态机");
        List<Sku> skus = productService.updateSpecs(draft.getId(), List.of(new SpecItem("颜色", List.of("黑"))));
        productService.updateSkus(
                draft.getId(),
                List.of(new SkuUpdateItem(skus.getFirst().getId(), null, null, 100L, null, 1, null, null)));
        productService.publish(draft.getId());

        // 1. 下架：上架 → 下架
        Product off = productService.off(draft.getId());
        assertEquals(0, off.getStatus());

        // 2. 下架态可改规格（决策 G：仅上架拒绝改规格），新 SKU 未设价
        List<Sku> next = productService.updateSpecs(draft.getId(), List.of(new SpecItem("颜色", List.of("白"))));
        assertEquals(1, next.size());
        assertEquals(null, next.getFirst().getPrice());

        // 3. 重新上架复检发布门槛：新 SKU 没价 → 400 拦截
        BusinessException ex = assertThrows(BusinessException.class, () -> productService.on(draft.getId()));
        assertEquals(400, ex.getHttpStatus());
    }
}
