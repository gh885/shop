package com.shop.platform.product;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ShopIdHolder;
import com.shop.platform.product.dto.SkuUpdateItem;
import com.shop.platform.product.mapper.CategoryAttr;
import com.shop.platform.product.mapper.CategoryAttrValue;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.service.CategoryAttrService;
import com.shop.platform.product.service.ProductService;
import com.shop.platform.product.service.ProductService.CreateProductCommand;
import com.shop.platform.product.service.ProductService.SpecSelection;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 四步流程集成验证：create → updateSpecs（按 spec_key 对账保留）→ updateSku → publish。
 * 规格值 ID 化后，规格选择基于类目属性模板（先建模板再按 ID 选值），模板建在 V5 种子三级类目「手机」上、用例结束自清。
 */
@SpringBootTest
class ProductIT extends IntegrationTestSupport {

    /** V5 种子数据里的三级类目「手机」 */
    private static final UUID SEED_CATEGORY = UUID.fromString("01900000-0000-7000-8000-000000000301");

    @Autowired
    private ProductService productService;

    @Autowired
    private CategoryAttrService categoryAttrService;

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

    /** 在种子类目上建销售属性 + 平台预置值（唯一名防重复跑撞 uk_category_attrs_category_name），自建自清 */
    private CategoryAttr seedSpecAttr(String name, String... values) {
        CategoryAttr attr = categoryAttrService.createAttr(
                SEED_CATEGORY,
                name + UUID.randomUUID().toString().substring(0, 8),
                CategoryAttr.KIND_SPEC,
                null,
                null,
                null);
        db.onDelete(
                "DELETE FROM product.category_attrs WHERE id = ?::uuid",
                attr.getId().toString());
        db.onDelete(
                "DELETE FROM product.category_attr_values WHERE attr_id = ?::uuid",
                attr.getId().toString());
        for (String value : values) {
            categoryAttrService.addValue(attr.getId(), value, null);
        }
        return attr;
    }

    /** 属性的值域行（按建档顺序：uuidv7 主键时间有序），供 SpecSelection 按 ID 选值 */
    private List<UUID> valueIds(UUID attrId) {
        return jdbc.queryForList(
                "SELECT id FROM product.category_attr_values WHERE attr_id = ?::uuid ORDER BY sort, id",
                UUID.class,
                attrId.toString());
    }

    @AfterEach
    void clearShopContext() {
        ShopIdHolder.clear();
    }

    @Test
    void 全流程_规格对账_发布聚合价() {
        CategoryAttr color = seedSpecAttr("颜色", "黑", "白");
        CategoryAttr size = seedSpecAttr("尺码", "S", "M", "L");
        List<UUID> colors = valueIds(color.getId());
        List<UUID> sizes = valueIds(size.getId());
        Product draft = createDraft("四步流程测试机");

        // 1. 选 颜色(黑,白) × 尺码(S,M,L)，生成 6 个 SKU
        List<Sku> six = productService.updateSpecs(
                draft.getId(),
                List.of(new SpecSelection(color.getId(), colors, null), new SpecSelection(size.getId(), sizes, null)));
        assertEquals(6, six.size());

        // 2. 给 6 个 SKU 填价 100
        List<SkuUpdateItem> priceAll = six.stream()
                .map(s -> new SkuUpdateItem(s.getId(), null, null, 100L, null, 10, null, null))
                .toList();
        productService.updateSkus(draft.getId(), priceAll);

        // 3. 加一个颜色值（红）→ 对账：原 6 个 spec_key 不变保留价格，新增 3 个价格为空
        CategoryAttrValue red = categoryAttrService.addValue(color.getId(), "红", null);
        List<Sku> nine = productService.updateSpecs(
                draft.getId(),
                List.of(
                        new SpecSelection(color.getId(), List.of(colors.get(0), colors.get(1), red.getId()), null),
                        new SpecSelection(size.getId(), sizes, null)));
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

    /** 核心回归：规格值改名只是改快照——spec_key 不动、价格库存不丢、SKU 的 attributes/name 快照被刷新 */
    @Test
    void 规格值改名_价格库存保留_SKU快照刷新() {
        CategoryAttr color = seedSpecAttr("颜色", "黑");
        UUID blackId = valueIds(color.getId()).getFirst();
        Product draft = createDraft("改名回归机");

        // 1. 建 SKU 并设价设量
        List<Sku> skus = productService.updateSpecs(
                draft.getId(), List.of(new SpecSelection(color.getId(), List.of(blackId), null)));
        assertEquals(1, skus.size());
        UUID skuId = skus.getFirst().getId();
        String specKey = skus.getFirst().getSpecKey();
        productService.updateSkus(
                draft.getId(), List.of(new SkuUpdateItem(skuId, null, null, 100L, null, 10, null, null)));

        // 2. 规格值改名：黑 → 曜石黑
        categoryAttrService.updateValue(blackId, "曜石黑", null);

        // 3. 断言：spec_key 不动（身份不变）、价格还在、库存行还在、name/attributes 快照已刷新
        Map<String, Object> sku = jdbc.queryForMap("SELECT * FROM product.skus WHERE id = ?::uuid", skuId.toString());
        assertEquals(specKey, sku.get("spec_key"));
        assertEquals(100L, ((Number) sku.get("price")).longValue());
        assertTrue(sku.get("name").toString().contains("曜石黑"));
        assertTrue(sku.get("attributes").toString().contains("曜石黑"));
        Integer stock = jdbc.queryForObject(
                "SELECT stock FROM inventory.sku_stock WHERE sku_id = ?::uuid", Integer.class, skuId.toString());
        assertEquals(10, stock);
    }

    @Test
    void 卖家自定义值_自动建档_卖家来源() {
        CategoryAttr color = seedSpecAttr("颜色", "黑");
        Product draft = createDraft("自定义值测试机");

        List<Sku> skus = productService.updateSpecs(
                draft.getId(), List.of(new SpecSelection(color.getId(), null, List.of("定制色"))));
        assertEquals(1, skus.size());

        Map<String, Object> row = jdbc.queryForMap(
                "SELECT source, value FROM product.category_attr_values WHERE attr_id = ?::uuid AND value = '定制色'",
                color.getId().toString());
        assertEquals(2, ((Number) row.get("source")).intValue());
    }

    @Test
    void 不允许自定义_提交值域外值_400() {
        CategoryAttr color = seedSpecAttr("颜色", "黑");
        categoryAttrService.updateAttr(color.getId(), color.getName(), null, false, null);
        Product draft = createDraft("禁自定义测试机");

        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> productService.updateSpecs(
                        draft.getId(), List.of(new SpecSelection(color.getId(), null, List.of("定制色")))));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    void 规格属性跨类目_400() {
        CategoryAttr color = seedSpecAttr("颜色", "黑");
        // 另一个类目下的属性，挂到本商品类目之外
        CategoryAttr foreign = categoryAttrService.createAttr(
                UUID.fromString("01900000-0000-7000-8000-000000000302"),
                "他类属性" + UUID.randomUUID().toString().substring(0, 8),
                CategoryAttr.KIND_SPEC,
                null,
                null,
                null);
        db.onDelete(
                "DELETE FROM product.category_attrs WHERE id = ?::uuid",
                foreign.getId().toString());
        Product draft = createDraft("跨类目测试机");

        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> productService.updateSpecs(
                        draft.getId(), List.of(new SpecSelection(foreign.getId(), null, List.of("任意")))));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    void 发布_存在未设价SKU_400() {
        CategoryAttr color = seedSpecAttr("颜色", "黑", "白");
        Product draft = createDraft("未设价草稿");
        productService.updateSpecs(
                draft.getId(), List.of(new SpecSelection(color.getId(), valueIds(color.getId()), null)));

        BusinessException ex = assertThrows(BusinessException.class, () -> productService.publish(draft.getId()));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    void 上架态改规格_409() {
        CategoryAttr color = seedSpecAttr("颜色", "黑", "白");
        Product draft = createDraft("已上架草稿");
        List<Sku> skus = productService.updateSpecs(
                draft.getId(),
                List.of(new SpecSelection(
                        color.getId(), List.of(valueIds(color.getId()).get(0)), null)));
        productService.updateSkus(
                draft.getId(),
                List.of(new SkuUpdateItem(skus.getFirst().getId(), null, null, 100L, null, 1, null, null)));
        productService.publish(draft.getId());

        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> productService.updateSpecs(
                        draft.getId(),
                        List.of(new SpecSelection(
                                color.getId(), List.of(valueIds(color.getId()).get(1)), null))));
        assertEquals(409, ex.getHttpStatus());
    }

    @Test
    void 下架改规格_重上架复检门槛() {
        CategoryAttr color = seedSpecAttr("颜色", "黑", "白");
        List<UUID> ids = valueIds(color.getId());
        Product draft = createDraft("上下架状态机");
        List<Sku> skus = productService.updateSpecs(
                draft.getId(), List.of(new SpecSelection(color.getId(), List.of(ids.get(0)), null)));
        productService.updateSkus(
                draft.getId(),
                List.of(new SkuUpdateItem(skus.getFirst().getId(), null, null, 100L, null, 1, null, null)));
        productService.publish(draft.getId());

        // 1. 下架：上架 → 下架
        Product off = productService.off(draft.getId());
        assertEquals(0, off.getStatus());

        // 2. 下架态可改规格（决策 G：仅上架拒绝改规格），换值 = 换 spec_key，新 SKU 未设价
        List<Sku> next = productService.updateSpecs(
                draft.getId(), List.of(new SpecSelection(color.getId(), List.of(ids.get(1)), null)));
        assertEquals(1, next.size());
        assertEquals(null, next.getFirst().getPrice());

        // 3. 重新上架复检发布门槛：新 SKU 没价 → 400 拦截
        BusinessException ex = assertThrows(BusinessException.class, () -> productService.on(draft.getId()));
        assertEquals(400, ex.getHttpStatus());
    }
}
