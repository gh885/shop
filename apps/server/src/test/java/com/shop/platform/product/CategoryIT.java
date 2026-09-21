package com.shop.platform.product;

import static org.junit.jupiter.api.Assertions.*;

import com.shop.platform.common.BusinessException;
import com.shop.platform.product.mapper.Category;
import com.shop.platform.product.model.CategoryStatus;
import com.shop.platform.product.service.CategoryNode;
import com.shop.platform.product.service.CategoryService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** 基于种子数据（V5）验证类目树与 service 校验规则。 */
@SpringBootTest
class CategoryIT extends IntegrationTestSupport {

    private static final UUID L1_DIGITAL = UUID.fromString("01900000-0000-7000-8000-000000000101");
    private static final UUID L1_COMPUTER = UUID.fromString("01900000-0000-7000-8000-000000000102");
    private static final UUID L2_PHONE_COMM = UUID.fromString("01900000-0000-7000-8000-000000000201");
    private static final UUID L3_PHONE = UUID.fromString("01900000-0000-7000-8000-000000000301");

    /** 种子数据里的 6 个一级类目，测试可能产生脏根时用它做基线清理 */
    private static final List<UUID> SEED_ROOT_IDS = List.of(
            UUID.fromString("01900000-0000-7000-8000-000000000101"),
            UUID.fromString("01900000-0000-7000-8000-000000000102"),
            UUID.fromString("01900000-0000-7000-8000-000000000103"),
            UUID.fromString("01900000-0000-7000-8000-000000000104"),
            UUID.fromString("01900000-0000-7000-8000-000000000105"),
            UUID.fromString("01900000-0000-7000-8000-000000000106"));

    @Autowired
    private CategoryService categoryService;

    /** 集成测试库是长生命周期的，崩溃残留的非种子类目会影响 publicTree 计数；每次先清根级孤儿。 */
    @BeforeEach
    void purgeLeftoverCategories() {
        jdbc.update(
                "DELETE FROM product.categories WHERE parent_id = ?::uuid AND id NOT IN ("
                        + "?::uuid, ?::uuid, ?::uuid, ?::uuid, ?::uuid, ?::uuid)",
                Category.ROOT_PARENT_ID.toString(),
                SEED_ROOT_IDS.get(0).toString(),
                SEED_ROOT_IDS.get(1).toString(),
                SEED_ROOT_IDS.get(2).toString(),
                SEED_ROOT_IDS.get(3).toString(),
                SEED_ROOT_IDS.get(4).toString(),
                SEED_ROOT_IDS.get(5).toString());
        // 如果残留根下面有过子节点，删根后变成孤儿，再扫一次
        jdbc.update(
                "DELETE FROM product.categories WHERE parent_id != ?::uuid AND parent_id NOT IN (SELECT id FROM product.categories)",
                Category.ROOT_PARENT_ID.toString());
    }

    @Test
    void 公开树_种子数据完整() {
        List<CategoryNode> roots = categoryService.publicTree();
        assertEquals(6, roots.size());
        assertEquals("手机数码", roots.getFirst().name());
        assertFalse(roots.getFirst().children().isEmpty());
        assertTrue(roots.getFirst().children().getFirst().children().stream().allMatch(n -> n.level() == 3));
    }

    @Test
    void 三级下建子类目_400() {
        BusinessException ex =
                assertThrows(BusinessException.class, () -> categoryService.create(L3_PHONE, "四级类目", null, null));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    void 同级重名_409() {
        BusinessException ex =
                assertThrows(BusinessException.class, () -> categoryService.create(L1_DIGITAL, "手机通讯", null, null));
        assertEquals(409, ex.getHttpStatus());
    }

    @Test
    void 禁用节点_公开树剪枝() {
        // 名字带随机后缀：uk_categories_parent_name 唯一索引要求根类目名唯一，直连持久库时重复跑测试不会撞索引
        String uniqueName = "临时类目" + UUID.randomUUID().toString().substring(0, 8);
        Category created = categoryService.create(null, uniqueName, 99, null);
        Category child = categoryService.create(created.getId(), "临时子类目", null, null);
        db.onDelete(
                "DELETE FROM product.categories WHERE id IN (?::uuid, ?::uuid)",
                created.getId().toString(),
                child.getId().toString());

        categoryService.updateStatus(created.getId(), CategoryStatus.DISABLED);

        List<CategoryNode> roots = categoryService.publicTree();
        assertTrue(roots.stream().noneMatch(n -> n.id().equals(created.getId())));
        // 管理端树仍可见（含禁用子树）
        assertTrue(categoryService.adminTree().stream().anyMatch(n -> n.id().equals(created.getId())));
    }

    /** 召回用：tab 可能指向一级类目，而商品挂在三级，所以要「含自身 + 全部后代」 */
    @Test
    void 子树展开_含自身与全部后代() {
        Set<UUID> subtree = categoryService.descendantIds(L1_DIGITAL);

        assertTrue(subtree.contains(L1_DIGITAL), "含自身");
        assertTrue(subtree.contains(L2_PHONE_COMM), "含二级后代");
        assertTrue(subtree.contains(L3_PHONE), "含三级后代");
        assertFalse(subtree.contains(L1_COMPUTER), "不含兄弟一级类目");
    }

    /** 禁用中间节点：整支剪掉（与公开树同口径），否则 feed 会召回隐藏类目下的商品 */
    @Test
    void 禁用中间节点_整支剪掉() {
        String uniqueName = "子树类目" + UUID.randomUUID().toString().substring(0, 8);
        Category root = categoryService.create(null, uniqueName, 99, null);
        Category middle = categoryService.create(root.getId(), "中间层", null, null);
        Category leaf = categoryService.create(middle.getId(), "叶子层", null, null);
        db.onDelete(
                "DELETE FROM product.categories WHERE id IN (?::uuid, ?::uuid, ?::uuid)",
                leaf.getId().toString(),
                middle.getId().toString(),
                root.getId().toString());

        categoryService.updateStatus(middle.getId(), CategoryStatus.DISABLED);

        Set<UUID> subtree = categoryService.descendantIds(root.getId());
        assertTrue(subtree.contains(root.getId()), "根自身仍可见");
        assertFalse(subtree.contains(middle.getId()), "禁用节点本身不可见");
        assertFalse(subtree.contains(leaf.getId()), "父链断了，后代一起剪掉");
        assertTrue(categoryService.descendantIds(middle.getId()).isEmpty(), "从禁用节点出发取子树 = 空集");
    }

    @Test
    void 未知类目_空集() {
        assertTrue(categoryService.descendantIds(UUID.randomUUID()).isEmpty());
    }

    /** 禁用闸门：类目下仍有商品引用（含草稿）拒绝禁用，移出后放行 */
    @Test
    void 类目被商品引用_禁用拒绝_移除后放行() {
        String uniqueName = "占用类目" + UUID.randomUUID().toString().substring(0, 8);
        Category created = categoryService.create(null, uniqueName, 99, null);

        UUID productId = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO product.products (id, shop_id, category_id, name, status) VALUES (?::uuid, ?::uuid, ?::uuid, '占位商品', 'WAREHOUSE')",
                productId.toString(),
                UUID.randomUUID().toString(),
                created.getId().toString());
        // 先父后子登记（purge 逆序执行）；占位商品无 SKU，幂等
        db.onDelete(
                "DELETE FROM product.categories WHERE id = ?::uuid",
                created.getId().toString());
        db.onDelete("DELETE FROM product.skus WHERE product_id = ?::uuid", productId.toString());
        db.onDelete("DELETE FROM product.products WHERE id = ?::uuid", productId.toString());

        BusinessException ex = assertThrows(
                BusinessException.class, () -> categoryService.updateStatus(created.getId(), CategoryStatus.DISABLED));
        assertEquals(400, ex.getHttpStatus());

        jdbc.update("DELETE FROM product.products WHERE id = ?::uuid", productId.toString()); // 被测行为：移出商品
        categoryService.updateStatus(created.getId(), CategoryStatus.DISABLED); // 移出后可禁用
    }

    /** 建一棵临时三级类目链（根→二级→叶子）并登记自清，返回 [根, 二级, 叶子] */
    private List<Category> seedMountableChain() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Category root = categoryService.create(null, "闸门根" + suffix, 99, null);
        Category middle = categoryService.create(root.getId(), "闸门的二级" + suffix, null, null);
        Category leaf = categoryService.create(middle.getId(), "闸门的叶子" + suffix, null, null);
        db.onDelete(
                "DELETE FROM product.categories WHERE id IN (?::uuid, ?::uuid, ?::uuid)",
                leaf.getId().toString(),
                middle.getId().toString(),
                root.getId().toString());
        return List.of(root, middle, leaf);
    }

    /** 禁用闸门按子树统计：商品只挂三级叶子，禁一级时「直挂引用数」恒 0，必须展开子树才拦得住 */
    @Test
    void 禁用一级类目_三级子树挂着商品_拒绝() {
        List<Category> chain = seedMountableChain();
        Category root = chain.getFirst();
        Category leaf = chain.getLast();
        UUID productId = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO product.products (id, shop_id, category_id, name, status) VALUES (?::uuid, ?::uuid, ?::uuid, '子树占位商品', 'WAREHOUSE')",
                productId.toString(),
                UUID.randomUUID().toString(),
                leaf.getId().toString());
        db.onDelete("DELETE FROM product.skus WHERE product_id = ?::uuid", productId.toString());
        db.onDelete("DELETE FROM product.products WHERE id = ?::uuid", productId.toString());

        BusinessException ex = assertThrows(
                BusinessException.class, () -> categoryService.updateStatus(root.getId(), CategoryStatus.DISABLED));
        assertEquals(400, ex.getHttpStatus());
        assertTrue(ex.getMessage().contains("该类目或其子分类"), "文案要说出波及范围是子树，不只是本类目");
    }

    /** 空子树可禁：子孙都没挂商品时闸门放行，一级整支从公开侧消失；启用方向不受闸门约束可恢复 */
    @Test
    void 禁用一级类目_子树为空_放行且可再启用() {
        Category root = seedMountableChain().getFirst();

        categoryService.updateStatus(root.getId(), CategoryStatus.DISABLED);
        assertTrue(categoryService.publicTree().stream().noneMatch(n -> n.id().equals(root.getId())), "禁用后公开树整支剪掉");

        categoryService.updateStatus(root.getId(), CategoryStatus.ENABLED);
        assertEquals(3, categoryService.descendantIds(root.getId()).size(), "重新启用后子树恢复可达");
    }
}
