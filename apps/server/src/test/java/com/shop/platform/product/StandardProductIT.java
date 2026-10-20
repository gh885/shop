package com.shop.platform.product;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.common.BusinessException;
import com.shop.platform.product.dto.StandardProductRequest;
import com.shop.platform.product.mapper.Category;
import com.shop.platform.product.mapper.StandardProduct;
import com.shop.platform.product.mapper.StandardProductMapper;
import com.shop.platform.product.model.ParamItem;
import com.shop.platform.product.model.StandardProductStatus;
import com.shop.platform.product.service.ProductService;
import com.shop.platform.product.service.ProductService.CreateProductCommand;
import com.shop.platform.product.service.StandardProductService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 平台标准品：跨商家识别「同一个东西」的那一层。
 *
 * <p>钉住三条边界：① 标准品不进交易链路（挂靠与否都不影响商品本身可售）；
 * ② 商家商品到标准品是多对一、可空；③ 错匹配的收口是「合并」而不是删除。
 */
@SpringBootTest
class StandardProductIT extends IntegrationTestSupport {

    /** V5 种子数据里的三级类目「手机」 */
    private static final UUID SEED_CATEGORY = UUID.fromString("01900000-0000-7000-8000-000000000301");

    /** V5 种子数据里的二级类目「手机通讯」（非叶子，标准品允许挂非叶子：它是聚合维） */
    private static final UUID SEED_CATEGORY_L2 = UUID.fromString("01900000-0000-7000-8000-000000000201");

    /** V43 模板里「手机」的必填参数「屏幕尺寸」：建草稿必须带上，否则 400 */
    private static final ParamItem REQUIRED_PARAM =
            new ParamItem(UUID.fromString("01900000-0000-7000-8000-000000430103"), "屏幕尺寸", "6.1英寸");

    @Autowired
    private StandardProductService standardProductService;

    @Autowired
    private StandardProductMapper standardProductMapper;

    @Autowired
    private ProductService productService;

    /** 建标准品并登记清理（自建自清，继承 IntegrationTestSupport 的 db 登记表） */
    private StandardProduct seedStandard(String name, String barcode) {
        StandardProduct standard =
                standardProductService.create(new StandardProductRequest(SEED_CATEGORY, name, "测试品牌", barcode));
        db.onDelete(
                "DELETE FROM product.standard_products WHERE id = ?::uuid",
                standard.getId().toString());
        return standard;
    }

    /** 建一个本店商品草稿（挂靠只要求商品存在且归属本店，不要求已发布） */
    private UUID seedProduct(UUID shopId) {
        db.onDelete("DELETE FROM product.products WHERE shop_id = ?::uuid", shopId.toString());
        db.onDelete(
                "DELETE FROM product.skus WHERE product_id IN (SELECT id FROM product.products WHERE shop_id = ?::uuid)",
                shopId.toString());
        return productService
                .create(new CreateProductCommand(
                        shopId, SEED_CATEGORY, "标准品测试机", null, null, null, List.of(), List.of(REQUIRED_PARAM), null))
                .getId();
    }

    @Test
    void 标准品可以挂在非叶子类目_它是聚合维不是售卖位() {
        StandardProduct standard =
                standardProductService.create(new StandardProductRequest(SEED_CATEGORY_L2, "聚合维标准品", null, null));
        db.onDelete(
                "DELETE FROM product.standard_products WHERE id = ?::uuid",
                standard.getId().toString());

        assertEquals(StandardProductStatus.ACTIVE, standard.getStatus());
        assertEquals(SEED_CATEGORY_L2, standard.getCategoryId());
    }

    @Test
    void 条码在可用标准品内唯一_重复建被拒() {
        String barcode = "690" + UUID.randomUUID().toString().substring(0, 10);
        seedStandard("条码唯一-A", barcode);

        BusinessException dup = assertThrows(
                BusinessException.class,
                () -> standardProductService.create(
                        new StandardProductRequest(SEED_CATEGORY, "条码唯一-B", null, barcode)));
        assertEquals(400, dup.getHttpStatus());
    }

    @Test
    void 多对一挂靠_两个商家商品可挂同一个标准品() {
        StandardProduct standard = seedStandard("多对一", null);
        UUID shopA = UUID.randomUUID();
        UUID shopB = UUID.randomUUID();
        UUID productA = seedProduct(shopA);
        UUID productB = seedProduct(shopB);

        // 两家店各自把自己的商品挂到同一个标准品上——这就是「跨商家识别同一个东西」
        standardProductService.bind(shopA, productA, standard.getId());
        standardProductService.bind(shopB, productB, standard.getId());

        assertEquals(
                2L,
                jdbc.queryForObject(
                        "SELECT count(*) FROM product.products WHERE standard_product_id = ?::uuid",
                        Long.class,
                        standard.getId().toString()));
    }

    @Test
    void 取消挂靠_写回NULL() {
        StandardProduct standard = seedStandard("取消挂靠", null);
        UUID shopId = UUID.randomUUID();
        UUID productId = seedProduct(shopId);

        standardProductService.bind(shopId, productId, standard.getId());
        assertEquals(
                standard.getId(),
                jdbc.queryForObject(
                        "SELECT standard_product_id FROM product.products WHERE id = ?::uuid",
                        UUID.class,
                        productId.toString()));

        // 传 null = 取消挂靠：updateById 会忽略 null 字段，这条走的是单列条件更新
        standardProductService.bind(shopId, productId, null);
        assertNull(jdbc.queryForObject(
                "SELECT standard_product_id FROM product.products WHERE id = ?::uuid",
                UUID.class,
                productId.toString()));
    }

    @Test
    void 越店挂靠_按商品不存在回答() {
        StandardProduct standard = seedStandard("越店", null);
        UUID ownerShop = UUID.randomUUID();
        UUID productId = seedProduct(ownerShop);

        BusinessException denied = assertThrows(
                BusinessException.class,
                () -> standardProductService.bind(UUID.randomUUID(), productId, standard.getId()));
        assertEquals(404, denied.getHttpStatus());
    }

    @Test
    void 合并_挂靠关系改指到目标_来源置MERGED不物理删() {
        StandardProduct target = seedStandard("合并目标", null);
        StandardProduct source =
                seedStandard("合并来源", "690" + UUID.randomUUID().toString().substring(0, 10));
        UUID shopId = UUID.randomUUID();
        UUID productId = seedProduct(shopId);
        standardProductService.bind(shopId, productId, source.getId());

        standardProductService.merge(source.getId(), target.getId());

        // 1. 来源行还在，但已置 MERGED 并记下去向（不物理删）
        StandardProduct reloaded = standardProductMapper.selectById(source.getId());
        assertEquals(StandardProductStatus.MERGED, reloaded.getStatus());
        assertEquals(target.getId(), reloaded.getMergedInto());
        // 2. 条码释放：合并后不该继续占着唯一索引
        assertNull(reloaded.getBarcode());
        // 3. 挂靠关系改指到目标
        assertEquals(
                target.getId(),
                jdbc.queryForObject(
                        "SELECT standard_product_id FROM product.products WHERE id = ?::uuid",
                        UUID.class,
                        productId.toString()));
    }

    @Test
    void 已合并的标准品_不再接受新挂靠() {
        StandardProduct target = seedStandard("合并目标2", null);
        StandardProduct source = seedStandard("合并来源2", null);
        standardProductService.merge(source.getId(), target.getId());

        UUID shopId = UUID.randomUUID();
        UUID productId = seedProduct(shopId);
        BusinessException rejected = assertThrows(
                BusinessException.class, () -> standardProductService.bind(shopId, productId, source.getId()));
        assertEquals(404, rejected.getHttpStatus());
    }

    @Test
    void 候选列表_只出可用标准品_可按条码精确找() {
        String barcode = "690" + UUID.randomUUID().toString().substring(0, 10);
        StandardProduct hit = seedStandard("候选命中", barcode);
        StandardProduct merged = seedStandard("候选已合并", null);
        standardProductService.merge(merged.getId(), hit.getId());

        List<UUID> ids = standardProductService.candidates(null, barcode).stream()
                .map(c -> c.id())
                .toList();
        assertTrue(ids.contains(hit.getId()));
        // 已合并的不进候选：挂不上一个已经并走的标准品
        assertTrue(!ids.contains(merged.getId()));
    }

    @Test
    void 禁用类目下_不能建标准品() {
        // 自建一个禁用类目：种子里未必有禁用的，靠「碰运气找到一条」写守卫等于没写
        UUID disabledCategory = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO product.categories (id, parent_id, name, level, sort, status) VALUES (?::uuid, ?::uuid, ?, 1, 0, 'DISABLED')",
                disabledCategory.toString(),
                Category.ROOT_PARENT_ID.toString(),
                "禁用类目" + disabledCategory.toString().substring(0, 8));
        db.onDelete("DELETE FROM product.categories WHERE id = ?::uuid", disabledCategory.toString());

        BusinessException rejected = assertThrows(
                BusinessException.class,
                () -> standardProductService.create(new StandardProductRequest(disabledCategory, "禁用类目下", null, null)));
        assertEquals(400, rejected.getHttpStatus());
    }
}
