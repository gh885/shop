package com.shop.platform.recommend;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.product.api.ProductCardView;
import com.shop.platform.product.mapper.Category;
import com.shop.platform.product.model.CategoryStatus;
import com.shop.platform.product.service.CategoryService;
import com.shop.platform.recommend.dto.FeedQuery;
import com.shop.platform.recommend.service.FeedPage;
import com.shop.platform.recommend.service.FeedService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * feed 召回与游标翻页的真库验证：keyset 不重不漏、tab 一级类目命中三级商品、末页游标为空、
 * 未知 / 禁用类目空流、非法游标 400。
 *
 * <p>自建自清，且<b>召回范围用自建类目圈定</b>——库里的演示商品与本套件其它用例的商品都挂在别处，
 * 断言因此与库中存量无关。
 */
@SpringBootTest
class FeedIT extends IntegrationTestSupport {

    /** V5 种子：一级「手机数码」与其下二级「手机通讯」、三级「智能手机」 */
    private static final UUID L1_DIGITAL = UUID.fromString("01900000-0000-7000-8000-000000000101");

    private static final UUID L3_PHONE = UUID.fromString("01900000-0000-7000-8000-000000000301");

    @Autowired
    private FeedService feedService;

    @Autowired
    private CategoryService categoryService;

    /** 自建一级类目（随机名避开同级重名唯一索引），登记清理 */
    private UUID seedRootCategory() {
        Category category = categoryService.create(
                null, "feed测试类目" + UUID.randomUUID().toString().substring(0, 8), 99, null);
        db.onDelete(
                "DELETE FROM product.categories WHERE id = ?::uuid",
                category.getId().toString());
        return category.getId();
    }

    /** 在类目下挂一个上架商品（带价、带销量 7），返回商品 id */
    private UUID seedPublishedProduct(UUID categoryId, long priceFen) {
        UUID productId = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO product.products (id, shop_id, category_id, name, subtitle, main_image, min_price, max_price,"
                        + " currency, status, sold_count) VALUES (?::uuid, ?::uuid, ?::uuid, 'feed测试商品', '一句话卖点',"
                        + " 'product/a.jpg', ?, ?, 'CNY', 'PUBLISHED', 7)",
                productId.toString(),
                UUID.randomUUID().toString(),
                categoryId.toString(),
                priceFen,
                priceFen);
        db.onDelete("DELETE FROM product.products WHERE id = ?::uuid", productId.toString());
        return productId;
    }

    /** 从无游标起一路翻到底：返回全程按出现顺序看到的 id（同时断言每页不超 size、游标终会收口） */
    private List<UUID> drain(UUID categoryId, int size) {
        List<UUID> seen = new ArrayList<>();
        String cursor = null;
        for (int pages = 0; pages < 100; pages++) {
            FeedPage page = feedService.page(new FeedQuery(categoryId, cursor, size));
            assertTrue(page.items().size() <= size, "每页不得超过 size");
            page.items().forEach(card -> seen.add(card.id()));
            cursor = page.nextCursor();
            if (cursor == null) {
                return seen;
            }
        }
        throw new AssertionError("翻页没有终点：游标始终不为 null");
    }

    @Test
    void 固定种子_连续翻页_不重不漏() {
        UUID categoryId = seedRootCategory();
        List<UUID> seeded = List.of(
                seedPublishedProduct(categoryId, 1000),
                seedPublishedProduct(categoryId, 1100),
                seedPublishedProduct(categoryId, 1200),
                seedPublishedProduct(categoryId, 1300),
                seedPublishedProduct(categoryId, 1400));

        // size=2：5 条商品要翻 3 页（2 + 2 + 1），全程复用同一个种子（由游标带回）
        List<UUID> seen = drain(categoryId, 2);

        assertEquals(5, seen.size(), "翻到底应该恰好看到全部商品");
        assertEquals(5, new HashSet<>(seen).size(), "同一个种子下不得重复");
        assertTrue(seen.containsAll(seeded));
    }

    @Test
    void 一级类目tab_命中三级商品() {
        UUID productId = seedPublishedProduct(L3_PHONE, 1999);

        List<UUID> seen = drain(L1_DIGITAL, 48);

        assertTrue(seen.contains(productId), "tab 指向一级类目时，挂在三级类目的商品必须被召回");
        assertFalse(seen.contains(L1_DIGITAL), "类目 id 不是商品 id，不该混进结果");
    }

    @Test
    void 续翻游标_同种子同顺序() {
        UUID categoryId = seedRootCategory();
        seedPublishedProduct(categoryId, 1000);
        seedPublishedProduct(categoryId, 1100);
        seedPublishedProduct(categoryId, 1200);

        FeedPage first = feedService.page(new FeedQuery(categoryId, null, 2));
        assertNotNull(first.nextCursor(), "还有第三条，第一页必须给游标");

        List<UUID> second = feedService.page(new FeedQuery(categoryId, first.nextCursor(), 2)).items().stream()
                .map(ProductCardView::id)
                .toList();
        List<UUID> again = feedService.page(new FeedQuery(categoryId, first.nextCursor(), 2)).items().stream()
                .map(ProductCardView::id)
                .toList();

        assertEquals(second, again, "同一游标必须解出同一个种子与位置");
    }

    @Test
    void 末页_nextCursor为空() {
        UUID categoryId = seedRootCategory();
        seedPublishedProduct(categoryId, 1000);

        FeedPage page = feedService.page(new FeedQuery(categoryId, null, 24));

        assertEquals(1, page.items().size());
        assertNull(page.nextCursor());
    }

    @Test
    void 卡片_带销量与价格区间() {
        UUID categoryId = seedRootCategory();
        UUID productId = seedPublishedProduct(categoryId, 1999);

        FeedPage page = feedService.page(new FeedQuery(categoryId, null, 24));
        ProductCardView card = page.items().getFirst();

        assertEquals(productId, card.id());
        assertEquals(1999, card.minPrice().amount());
        assertEquals(Money.cny(1999), card.minPrice());
        assertEquals(7L, card.soldCount(), "销量投影列必须随卡片吐出来");
    }

    @Test
    void 未知类目_空流不报错() {
        FeedPage page = feedService.page(new FeedQuery(UUID.randomUUID(), null, 24));

        assertTrue(page.items().isEmpty());
        assertNull(page.nextCursor());
    }

    @Test
    void 父类目被禁用_子类目商品不再召回() {
        // 禁用闸门只管「直接引用」：父类目自己不挂商品，所以禁得掉，而子类目下的商品还留在库里——
        // 「父链断了整支剪掉」因此是真会发生的场景，不是纸面推演
        UUID rootId = seedRootCategory();
        Category child = categoryService.create(rootId, "子类目", null, null);
        db.onDelete(
                "DELETE FROM product.categories WHERE id = ?::uuid",
                child.getId().toString());
        UUID productId = seedPublishedProduct(child.getId(), 1000);

        assertTrue(drain(rootId, 24).contains(productId), "禁用前：一级 tab 应召回子类目下的商品");

        categoryService.updateStatus(rootId, CategoryStatus.DISABLED);

        FeedPage page = feedService.page(new FeedQuery(rootId, null, 24));
        assertTrue(page.items().isEmpty(), "父链断了：隐藏类目不给流，但也不该 404");
    }

    @Test
    void 非法游标_400() {
        // 形态就不对：没有分隔点
        BusinessException bad =
                assertThrows(BusinessException.class, () -> feedService.page(new FeedQuery(null, "not-a-cursor", 24)));
        assertEquals(400, bad.getHttpStatus());

        // 形态对但 UUID 段不成立（36 个 '-' 过得了正则，过不了 fromString）
        BusinessException malformed = assertThrows(
                BusinessException.class,
                () -> feedService.page(new FeedQuery(null, "0011223344556677." + "-".repeat(36), 24)));
        assertEquals(400, malformed.getHttpStatus());
    }
}
