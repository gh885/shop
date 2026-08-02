package com.shop.platform.product;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.shop.platform.common.BusinessException;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.service.ProductService;
import com.shop.platform.product.service.ProductService.CreateProductCommand;
import com.shop.platform.product.service.ProductService.SkuUpdateItem;
import com.shop.platform.product.service.ProductService.SpecItem;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** 四步流程集成验证：create → updateSpecs（对账保留）→ updateSku → publish。基于 V5 种子类目数据。 */
@SpringBootTest
class ProductServiceIntegrationTest {

    /** V5 种子数据里的三级类目「手机」 */
    private static final UUID SEED_CATEGORY =
            UUID.fromString("01900000-0000-7000-8000-000000000301");

    @Autowired private ProductService productService;

    private Product createDraft(String name) {
        return productService.create(
                new CreateProductCommand(
                        UUID.randomUUID(), // shopId，暂无店铺模块，前端传入
                        SEED_CATEGORY,
                        name,
                        null,
                        null,
                        null,
                        List.of(),
                        List.of()));
    }

    @Test
    void fullJourney_specReconcileAndPublish() {
        Product draft = createDraft("四步流程测试机");

        // 1. 定义 颜色(黑,白) × 尺码(S,M,L)，生成 6 个 SKU
        List<Sku> six =
                productService.updateSpecs(
                        draft.getId(),
                        List.of(
                                new SpecItem("颜色", List.of("黑", "白")),
                                new SpecItem("尺码", List.of("S", "M", "L"))));
        assertEquals(6, six.size());

        // 2. 给 6 个 SKU 填价 100
        List<SkuUpdateItem> priceAll =
                six.stream()
                        .map(s -> new SkuUpdateItem(s.getId(), null, null, 100L, null, 10))
                        .toList();
        productService.updateSkus(draft.getId(), priceAll);

        // 3. 加一个颜色 → 对账：原 6 个保留价格，新增 3 个（红）价格为空
        List<Sku> nine =
                productService.updateSpecs(
                        draft.getId(),
                        List.of(
                                new SpecItem("颜色", List.of("黑", "白", "红")),
                                new SpecItem("尺码", List.of("S", "M", "L"))));
        assertEquals(9, nine.size());
        long keptPriced = nine.stream().filter(s -> s.getPrice() != null).count();
        assertEquals(6, keptPriced);

        // 4. 给新增 3 个填价 300
        List<SkuUpdateItem> priceNew =
                nine.stream()
                        .filter(s -> s.getPrice() == null)
                        .map(s -> new SkuUpdateItem(s.getId(), null, null, 300L, null, 5))
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
    void publish_withoutPrices_rejected() {
        Product draft = createDraft("未设价草稿");
        productService.updateSpecs(draft.getId(), List.of(new SpecItem("颜色", List.of("黑", "白"))));

        BusinessException ex =
                assertThrows(BusinessException.class, () -> productService.publish(draft.getId()));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    void updateSpecs_afterPublish_rejected() {
        Product draft = createDraft("已上架草稿");
        List<Sku> skus =
                productService.updateSpecs(
                        draft.getId(), List.of(new SpecItem("颜色", List.of("黑"))));
        productService.updateSkus(
                draft.getId(),
                List.of(new SkuUpdateItem(skus.getFirst().getId(), null, null, 100L, null, 1)));
        productService.publish(draft.getId());

        BusinessException ex =
                assertThrows(
                        BusinessException.class,
                        () ->
                                productService.updateSpecs(
                                        draft.getId(), List.of(new SpecItem("颜色", List.of("白")))));
        assertEquals(409, ex.getHttpStatus());
    }
}
