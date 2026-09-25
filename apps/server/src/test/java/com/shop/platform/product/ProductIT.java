package com.shop.platform.product;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.common.PageResult;
import com.shop.platform.product.api.ProductCommand;
import com.shop.platform.product.dto.ProductQuery;
import com.shop.platform.product.dto.SkuUpdateItem;
import com.shop.platform.product.mapper.Category;
import com.shop.platform.product.mapper.CategoryAttr;
import com.shop.platform.product.mapper.CategoryAttrValue;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.ProductMapper;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.mapper.SkuMapper;
import com.shop.platform.product.model.AttrKind;
import com.shop.platform.product.model.CategoryStatus;
import com.shop.platform.product.model.ParamItem;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.product.service.CategoryAttrService;
import com.shop.platform.product.service.CategoryService;
import com.shop.platform.product.service.ProductListRow;
import com.shop.platform.product.service.ProductQueryService;
import com.shop.platform.product.service.ProductService;
import com.shop.platform.product.service.ProductService.CreateProductCommand;
import com.shop.platform.product.service.ProductService.UpdateBasicCommand;
import com.shop.platform.product.service.SkuService;
import com.shop.platform.product.service.SkuService.SpecSelection;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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

    /** V5 种子数据里的二级类目「手机通讯」（非叶子） */
    private static final UUID SEED_CATEGORY_L2 = UUID.fromString("01900000-0000-7000-8000-000000000201");

    /** V43 模板里「手机」的必填参数「屏幕尺寸」（attr 430103，值域 6.1/6.4/6.7 英寸）：建草稿必须带上 */
    private static final ParamItem REQUIRED_PARAM =
            new ParamItem(UUID.fromString("01900000-0000-7000-8000-000000430103"), "屏幕尺寸", "6.1英寸");

    @Autowired
    private ProductService productService;

    @Autowired
    private SkuService skuService;

    @Autowired
    private ProductQueryService productQueryService;

    @Autowired
    private CategoryAttrService categoryAttrService;

    @Autowired
    private CategoryService categoryService;

    @Autowired
    private ProductCommand productCommand;

    @Autowired
    private ProductMapper productMapper;

    @Autowired
    private SkuMapper skuMapper;

    /**
     * 卖家侧 service 方法显式收 shopId（线上来自 X-Shop-Id，测试自造一个传参）。
     * 自建自清：按 shopId 圈定商品与 SKU（先父后子登记，purge 逆序执行）。
     */
    private Product createDraft(String name) {
        UUID shopId = UUID.randomUUID();
        db.onDelete("DELETE FROM product.products WHERE shop_id = ?::uuid", shopId.toString());
        db.onDelete(
                "DELETE FROM product.skus WHERE product_id IN (SELECT id FROM product.products WHERE shop_id = ?::uuid)",
                shopId.toString());
        return productService.create(new CreateProductCommand(
                shopId, SEED_CATEGORY, name, null, null, null, List.of(), List.of(REQUIRED_PARAM), null));
    }

    /** 在种子类目上建销售属性 + 平台预置值（唯一名防重复跑撞 uk_category_attrs_category_name），自建自清 */
    private CategoryAttr seedSpecAttr(String name, String... values) {
        CategoryAttr attr = categoryAttrService.createAttr(
                SEED_CATEGORY,
                name + UUID.randomUUID().toString().substring(0, 8),
                AttrKind.SPEC,
                null,
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
            categoryAttrService.addValue(attr.getId(), value, null, null);
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

    /** SpecSelection 便利构造：三个可空核心参数 + 两张取值图 map 补 null（测试不必关心图） */
    private static SpecSelection spec(UUID attrId, List<UUID> valueIds, List<String> customValues) {
        return new SpecSelection(attrId, valueIds, customValues, null, null);
    }

    @Test
    void JSONB往返_保留列表元素的具体类型() {
        CategoryAttr color = seedSpecAttr("颜色", "曜石黑");
        UUID blackId = valueIds(color.getId()).getFirst();
        Product draft = createDraft("JSONB 类型回归");

        Product reloadedProduct = productMapper.selectById(draft.getId());
        assertEquals(List.of(REQUIRED_PARAM), reloadedProduct.getParams());

        skuService.updateSpecs(draft.getShopId(), draft.getId(), List.of(spec(color.getId(), List.of(blackId), null)));
        Sku reloadedSku = skuMapper.selectById(
                skuMapper.selectByProductId(draft.getId()).getFirst().getId());
        assertEquals("曜石黑", reloadedSku.getAttributes().getFirst().value());
    }

    @Test
    void 全流程_规格对账_发布聚合价() {
        CategoryAttr color = seedSpecAttr("颜色", "黑", "白");
        CategoryAttr size = seedSpecAttr("尺码", "S", "M", "L");
        List<UUID> colors = valueIds(color.getId());
        List<UUID> sizes = valueIds(size.getId());
        Product draft = createDraft("四步流程测试机");

        // 1. 选 颜色(黑,白) × 尺码(S,M,L)，生成 6 个 SKU
        List<Sku> six = skuService.updateSpecs(
                draft.getShopId(),
                draft.getId(),
                List.of(spec(color.getId(), colors, null), spec(size.getId(), sizes, null)));
        assertEquals(6, six.size());

        // 2. 给 6 个 SKU 填价 100
        List<SkuUpdateItem> priceAll = six.stream()
                .map(s -> new SkuUpdateItem(s.getId(), null, null, Money.cny(100), null, 10, null, null))
                .toList();
        skuService.updateSkus(draft.getShopId(), draft.getId(), priceAll);

        // 3. 加一个颜色值（红）→ 对账：原 6 个 spec_key 不变保留价格，新增 3 个价格为空
        CategoryAttrValue red = categoryAttrService.addValue(color.getId(), "红", null, null);
        List<Sku> nine = skuService.updateSpecs(
                draft.getShopId(),
                draft.getId(),
                List.of(
                        spec(color.getId(), List.of(colors.get(0), colors.get(1), red.getId()), null),
                        spec(size.getId(), sizes, null)));
        assertEquals(9, nine.size());
        long keptPriced = nine.stream().filter(s -> s.getPrice() != null).count();
        assertEquals(6, keptPriced);

        // 4. 给新增 3 个填价 300
        List<SkuUpdateItem> priceNew = nine.stream()
                .filter(s -> s.getPrice() == null)
                .map(s -> new SkuUpdateItem(s.getId(), null, null, Money.cny(300), null, 5, null, null))
                .toList();
        assertEquals(3, priceNew.size());
        skuService.updateSkus(draft.getShopId(), draft.getId(), priceNew);

        // 5. 发布：状态上架，min/max 聚合 100..300
        Product published = productService.publish(draft.getShopId(), draft.getId(), ProductStatus.PUBLISHED);
        assertEquals(ProductStatus.PUBLISHED, published.getStatus());
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
        List<Sku> skus = skuService.updateSpecs(
                draft.getShopId(), draft.getId(), List.of(spec(color.getId(), List.of(blackId), null)));
        assertEquals(1, skus.size());
        UUID skuId = skus.getFirst().getId();
        String specKey = skus.getFirst().getSpecKey();
        skuService.updateSkus(
                draft.getShopId(),
                draft.getId(),
                List.of(new SkuUpdateItem(skuId, null, null, Money.cny(100), null, 10, null, null)));

        // 2. 规格值改名：黑 → 曜石黑
        categoryAttrService.updateValue(blackId, "曜石黑", null, null);

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

        List<Sku> skus = skuService.updateSpecs(
                draft.getShopId(), draft.getId(), List.of(spec(color.getId(), null, List.of("定制色"))));
        assertEquals(1, skus.size());

        Map<String, Object> row = jdbc.queryForMap(
                "SELECT source, value FROM product.category_attr_values WHERE attr_id = ?::uuid AND value = '定制色'",
                color.getId().toString());
        assertEquals("SELLER", row.get("source"));
    }

    @Test
    void 不允许自定义_提交值域外值_400() {
        CategoryAttr color = seedSpecAttr("颜色", "黑");
        categoryAttrService.updateAttr(color.getId(), color.getName(), null, false, null, null);
        Product draft = createDraft("禁自定义测试机");

        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> skuService.updateSpecs(
                        draft.getShopId(), draft.getId(), List.of(spec(color.getId(), null, List.of("定制色")))));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    void 规格属性跨类目_400() {
        // 另一个类目下的属性，挂到本商品类目之外
        CategoryAttr foreign = categoryAttrService.createAttr(
                UUID.fromString("01900000-0000-7000-8000-000000000302"),
                "他类属性" + UUID.randomUUID().toString().substring(0, 8),
                AttrKind.SPEC,
                null,
                null,
                null,
                null);
        db.onDelete(
                "DELETE FROM product.category_attrs WHERE id = ?::uuid",
                foreign.getId().toString());
        Product draft = createDraft("跨类目测试机");

        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> skuService.updateSpecs(
                        draft.getShopId(), draft.getId(), List.of(spec(foreign.getId(), null, List.of("任意")))));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    void 发布_存在未设价SKU_400() {
        CategoryAttr color = seedSpecAttr("颜色", "黑", "白");
        Product draft = createDraft("未设价草稿");
        skuService.updateSpecs(
                draft.getShopId(), draft.getId(), List.of(spec(color.getId(), valueIds(color.getId()), null)));

        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> productService.publish(draft.getShopId(), draft.getId(), ProductStatus.PUBLISHED));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    void 上架态改规格_409() {
        CategoryAttr color = seedSpecAttr("颜色", "黑", "白");
        Product draft = createDraft("已上架草稿");
        List<Sku> skus = skuService.updateSpecs(
                draft.getShopId(),
                draft.getId(),
                List.of(spec(color.getId(), List.of(valueIds(color.getId()).get(0)), null)));
        skuService.updateSkus(
                draft.getShopId(),
                draft.getId(),
                List.of(new SkuUpdateItem(skus.getFirst().getId(), null, null, Money.cny(100), null, 1, null, null)));
        productService.publish(draft.getShopId(), draft.getId(), ProductStatus.PUBLISHED);

        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> skuService.updateSpecs(
                        draft.getShopId(),
                        draft.getId(),
                        List.of(spec(
                                color.getId(), List.of(valueIds(color.getId()).get(1)), null))));
        assertEquals(409, ex.getHttpStatus());
    }

    @Test
    void 下架改规格_重上架复检门槛() {
        CategoryAttr color = seedSpecAttr("颜色", "黑", "白");
        List<UUID> ids = valueIds(color.getId());
        Product draft = createDraft("上下架状态机");
        List<Sku> skus = skuService.updateSpecs(
                draft.getShopId(), draft.getId(), List.of(spec(color.getId(), List.of(ids.get(0)), null)));
        skuService.updateSkus(
                draft.getShopId(),
                draft.getId(),
                List.of(new SkuUpdateItem(skus.getFirst().getId(), null, null, Money.cny(100), null, 1, null, null)));
        productService.publish(draft.getShopId(), draft.getId(), ProductStatus.PUBLISHED);

        // 1. 下架：上架 → 下架
        Product off = productService.off(draft.getShopId(), draft.getId());
        assertEquals(ProductStatus.WAREHOUSE, off.getStatus());

        // 2. 下架态可改规格（决策 G：仅上架拒绝改规格），换值 = 换 spec_key，新 SKU 未设价
        List<Sku> next = skuService.updateSpecs(
                draft.getShopId(), draft.getId(), List.of(spec(color.getId(), List.of(ids.get(1)), null)));
        assertEquals(1, next.size());
        assertEquals(null, next.getFirst().getPrice());

        // 3. 重新上架复检发布门槛：新 SKU 没价 → 400 拦截
        BusinessException ex =
                assertThrows(BusinessException.class, () -> productService.on(draft.getShopId(), draft.getId()));
        assertEquals(400, ex.getHttpStatus());
    }

    /** PRD-43：重上复检的是「全部」发布门槛，标题也算——曾只有 publish 卡标题，这条路径能把空标题推上架 */
    @Test
    void 下架清空标题_重上架复检标题门槛() {
        CategoryAttr color = seedSpecAttr("颜色", "黑", "白");
        Product draft = createDraft("标题门槛");
        List<Sku> skus = skuService.updateSpecs(
                draft.getShopId(),
                draft.getId(),
                List.of(spec(color.getId(), List.of(valueIds(color.getId()).get(0)), null)));
        skuService.updateSkus(
                draft.getShopId(),
                draft.getId(),
                List.of(new SkuUpdateItem(skus.getFirst().getId(), null, null, Money.cny(100), null, 1, null, null)));
        productService.publish(draft.getShopId(), draft.getId(), ProductStatus.PUBLISHED);
        productService.off(draft.getShopId(), draft.getId());

        // 仓库中改基本信息：标题按 PATCH 语义可清空（空串＝清空，非「不改」）
        productService.updateBasic(
                draft.getShopId(), draft.getId(), new UpdateBasicCommand(null, "", null, null, null, null, null, null));
        // 回读确认前置条件真的成立（标题确实空进了库），否则这条用例什么都没测
        assertEquals(
                "",
                productQueryService
                        .detail(draft.getShopId(), draft.getId())
                        .product()
                        .getName());

        BusinessException ex =
                assertThrows(BusinessException.class, () -> productService.on(draft.getShopId(), draft.getId()));
        assertEquals(400, ex.getHttpStatus());
        assertEquals("请先填写商品标题再发布", ex.getDetail());
    }

    /** 列表指标：pageListWithMetrics 聚合库存（SKU 可用量之和）；销量读 products.sold_count 投影列（经 product.api :: ProductCommand 累加） */
    @Test
    void 列表指标_库存求和_销量读投影列() {
        CategoryAttr color = seedSpecAttr("颜色", "黑", "白");
        Product draft = createDraft("列表指标机");
        List<Sku> skus = skuService.updateSpecs(
                draft.getShopId(), draft.getId(), List.of(spec(color.getId(), valueIds(color.getId()), null)));
        Sku s1 = skus.get(0);
        Sku s2 = skus.get(1);
        skuService.updateSkus(
                draft.getShopId(),
                draft.getId(),
                List.of(
                        new SkuUpdateItem(s1.getId(), null, null, Money.cny(100), null, 3, null, null),
                        new SkuUpdateItem(s2.getId(), null, null, Money.cny(200), null, 7, null, null)));
        productService.publish(draft.getShopId(), draft.getId(), ProductStatus.PUBLISHED);

        UUID shopId = draft.getShopId();
        // 两笔已完成订单各成交 2 件、5 件（订单完成事务里经 product :: api 累加；待付款/取消不会走到这里）
        productCommand.addSold(Map.of(draft.getId(), 2));
        productCommand.addSold(Map.of(draft.getId(), 5));

        // 只查本店铺，不依赖其它测试残留
        PageResult<ProductListRow> page = productQueryService.pageListWithMetrics(shopId, null, null, 1, 50, null);
        ProductListRow row = page.records().stream()
                .filter(r -> r.product().getId().equals(draft.getId()))
                .findFirst()
                .orElseThrow();
        // 库存 = 3 + 7 = 10；销量 = 2 + 5 = 7
        assertEquals(10, row.stock());
        assertEquals(7L, row.soldCount());
    }

    /**
     * 单商品与详情出参的库存口径：与列表行同一个数（曾是写死 0——列表 10、创建/发布/详情响应 0，
     * 前端同名字段两个答案）。装配收在 {@code ProductQueryService}，故这一条只能在真库上验。
     */
    @Test
    void 单商品与详情出参_库存取真实值_不再写死0() {
        CategoryAttr color = seedSpecAttr("颜色", "黑");
        Product draft = createDraft("库存口径机");
        List<Sku> skus = skuService.updateSpecs(
                draft.getShopId(), draft.getId(), List.of(spec(color.getId(), valueIds(color.getId()), null)));
        skuService.updateSkus(
                draft.getShopId(),
                draft.getId(),
                List.of(new SkuUpdateItem(skus.getFirst().getId(), null, null, Money.cny(100), null, 6, null, null)));

        assertEquals(6, productQueryService.sellerView(draft).stock());

        var detail = productQueryService.sellerDetailView(draft.getShopId(), draft.getId());
        assertEquals(6, detail.product().stock());
        assertEquals(6, detail.skus().getFirst().stock());
    }

    /** 编辑基本信息：detailImages/images 是 JSONB 列，必须经实体 typeHandler 序列化，不得走 wrapper（回归：MP 数组参数 500） */
    @Test
    void 编辑基本信息_JSONB图片数组正常落库() {
        Product draft = createDraft("编辑JSONB机");
        Product updated = productService.updateBasic(
                draft.getShopId(),
                draft.getId(),
                new UpdateBasicCommand(
                        draft.getCategoryId(),
                        "新标题",
                        "新卖点字足够长十到三十个字",
                        List.of("product/a.jpg", "product/b.jpg"),
                        "product/main.jpg",
                        List.of("product/c.jpg"),
                        null,
                        null));
        assertEquals("新标题", updated.getName());
        assertEquals(List.of("product/a.jpg", "product/b.jpg"), updated.getDetailImages());
        assertEquals(List.of("product/c.jpg"), updated.getImages());
    }

    // ===== 商品挂载闸门：叶子 + 启用（父链完整） =====

    /** 建一棵临时三级类目链（根→中间→叶子）并登记自清，返回叶子 id */
    private Category seedCategoryChain(boolean disableMiddle, boolean disableLeaf) {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Category root = categoryService.create(null, "挂载根" + suffix, 99, null);
        Category middle = categoryService.create(root.getId(), "挂载中间" + suffix, null, null);
        Category leaf = categoryService.create(middle.getId(), "挂载叶子" + suffix, null, null);
        db.onDelete(
                "DELETE FROM product.categories WHERE id IN (?::uuid, ?::uuid, ?::uuid)",
                leaf.getId().toString(),
                middle.getId().toString(),
                root.getId().toString());
        if (disableMiddle) {
            categoryService.updateStatus(middle.getId(), CategoryStatus.DISABLED);
        }
        if (disableLeaf) {
            categoryService.updateStatus(leaf.getId(), CategoryStatus.DISABLED);
        }
        return leaf;
    }

    private CreateProductCommand mountCommand(UUID categoryId) {
        UUID shopId = UUID.randomUUID();
        db.onDelete("DELETE FROM product.products WHERE shop_id = ?::uuid", shopId.toString());
        return new CreateProductCommand(shopId, categoryId, "挂载闸门机", null, null, null, List.of(), List.of(), null);
    }

    @Test
    void 创建商品_挂父链全部启用的叶子类目_放行() {
        // 正例对照：与禁用用例只差一个 disable 开关，证明挡的是禁用而不是临时类目本身
        Category leaf = seedCategoryChain(false, false);
        Product draft = productService.create(mountCommand(leaf.getId()));
        assertEquals(leaf.getId(), draft.getCategoryId());
    }

    @Test
    void 创建商品_挂二级类目_拒绝() {
        BusinessException ex =
                assertThrows(BusinessException.class, () -> productService.create(mountCommand(SEED_CATEGORY_L2)));
        assertEquals(400, ex.getHttpStatus());
        assertEquals("CATEGORY_NOT_LEAF", ex.getCode());
    }

    @Test
    void 创建商品_挂禁用叶子类目_拒绝() {
        Category leaf = seedCategoryChain(false, true);
        BusinessException ex =
                assertThrows(BusinessException.class, () -> productService.create(mountCommand(leaf.getId())));
        assertEquals(400, ex.getHttpStatus());
        assertEquals("CATEGORY_DISABLED", ex.getCode());
    }

    @Test
    void 创建商品_挂父级禁用的启用叶子_拒绝() {
        // 叶子自身启用，但中间层禁用 → 公开树整支剪掉，商品会悬在买家不可见的类目里
        Category leaf = seedCategoryChain(true, false);
        BusinessException ex =
                assertThrows(BusinessException.class, () -> productService.create(mountCommand(leaf.getId())));
        assertEquals(400, ex.getHttpStatus());
        assertEquals("CATEGORY_DISABLED", ex.getCode());
    }

    @Test
    void 草稿改挂非叶子类目_拒绝() {
        Product draft = createDraft("改挂拦截机"); // 归属店铺的 shopId 挂在 draft.getShopId()，无需上下文
        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> productService.updateBasic(
                        draft.getShopId(),
                        draft.getId(),
                        new UpdateBasicCommand(SEED_CATEGORY_L2, null, null, null, null, null, null, null)));
        assertEquals(400, ex.getHttpStatus());
        assertEquals("CATEGORY_NOT_LEAF", ex.getCode());
    }

    // ===== 划线价闸门：original_price >= price =====

    /**
     * 划线价不得低于现价（不变式由 DB CHECK ck_skus_original_price_ge_price 钉死，service 先给友好 400）：
     * 当场画低、降价穿到存量划线价之下是同一不变式的两个入口；相等合法。
     */
    @Test
    void 划线价低于现价_拒绝() {
        CategoryAttr color = seedSpecAttr("颜色", "黑");
        Product draft = createDraft("划线价闸门机");
        UUID skuId = skuService
                .updateSpecs(
                        draft.getShopId(),
                        draft.getId(),
                        List.of(spec(
                                color.getId(), List.of(valueIds(color.getId()).getFirst()), null)))
                .getFirst()
                .getId();

        // 1. 当场画低：提交的划线价 50 < 提交的现价 100
        BusinessException lower = assertThrows(
                BusinessException.class,
                () -> skuService.updateSkus(
                        draft.getShopId(),
                        draft.getId(),
                        List.of(new SkuUpdateItem(skuId, null, null, Money.cny(100), Money.cny(50), 5, null, null))));
        assertEquals(400, lower.getHttpStatus());

        // 2. 合法保存：划线 200 > 现价 100；相等（100 = 100）也在边界内
        skuService.updateSkus(
                draft.getShopId(),
                draft.getId(),
                List.of(new SkuUpdateItem(skuId, null, null, Money.cny(100), Money.cny(200), 5, null, null)));
        skuService.updateSkus(
                draft.getShopId(),
                draft.getId(),
                List.of(new SkuUpdateItem(skuId, null, null, Money.cny(100), Money.cny(100), 5, null, null)));

        // 3. 只抬现价、不带划线价字段（划线价「不改」仍存量 100）：现价 150 穿过线，service 比的是存量
        BusinessException drop = assertThrows(
                BusinessException.class,
                () -> skuService.updateSkus(
                        draft.getShopId(),
                        draft.getId(),
                        List.of(new SkuUpdateItem(skuId, null, null, Money.cny(150), null, 5, null, null))));
        assertEquals(400, drop.getHttpStatus());
    }

    // ===== 买家列表类目可见性（与 feed 召回同口径） =====

    /**
     * 挂启用叶子但父级禁用 → 买家列表搜不到：pagePublic 的 categoryId 过滤经 CategoryService 展开启用子树，
     * 父链断则整支不可见 → 空页不报错。[PRD-07] 的禁用闸门已扩到子树（子树挂商品的一级/二级禁不掉），
     * 这里要的是「父禁用 + 子树有商品」的脏库存量形态，只能 SQL 直改 status 造出来——
     * 这正是列表必须跟随「父链启用」而非只查挂载类目自身的原因。
     */
    @Test
    void 挂启用叶子但父级禁用_买家列表_搜不到() {
        Category leaf = seedCategoryChain(false, false);
        Product product = productService.create(mountCommand(leaf.getId()));
        // 上架与类目可见性正交，直改 SQL 置 PUBLISHED，不必为读路径测试搭规格/定价/库存全链路
        jdbc.update(
                "UPDATE product.products SET status = 'PUBLISHED', min_price = 100, max_price = 100 WHERE id = ?::uuid",
                product.getId().toString());
        ProductQuery query = new ProductQuery(leaf.getId(), null, null, null);

        // 正例对照：父链全部启用时该叶子类目能搜到（差异只在中间层是否禁用）
        assertTrue(productQueryService.pagePublic(query, 1, 10).records().stream()
                .anyMatch(p -> p.getId().equals(product.getId())));

        UUID middleId = jdbc.queryForObject(
                "SELECT parent_id FROM product.categories WHERE id = ?::uuid",
                UUID.class,
                leaf.getId().toString());
        // SQL 直改而不是 service：子树已挂商品，updateStatus 的禁用闸门会 400（闸门只管正常运营路径）
        jdbc.update("UPDATE product.categories SET status = 'DISABLED' WHERE id = ?::uuid", middleId.toString());

        assertEquals(0, productQueryService.pagePublic(query, 1, 10).total());
        assertTrue(productQueryService.pagePublic(query, 1, 10).records().isEmpty());
    }
}
