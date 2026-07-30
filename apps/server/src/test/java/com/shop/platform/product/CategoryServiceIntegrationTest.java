package com.shop.platform.product;

import static org.junit.jupiter.api.Assertions.*;

import com.shop.platform.AbstractIntegrationTest;
import com.shop.platform.common.BusinessException;
import com.shop.platform.product.mapper.Category;
import com.shop.platform.product.service.CategoryService;
import com.shop.platform.product.service.CategoryService.CategoryNode;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** 基于种子数据（V5）验证类目树与 service 校验规则。 */
@SpringBootTest
class CategoryServiceIntegrationTest extends AbstractIntegrationTest {

    private static final UUID L1_DIGITAL = UUID.fromString("01900000-0000-7000-8000-000000000101");
    private static final UUID L3_PHONE = UUID.fromString("01900000-0000-7000-8000-000000000301");

    @Autowired private CategoryService categoryService;

    @Test
    void publicTree_loadsSeedData() {
        List<CategoryNode> roots = categoryService.publicTree();
        assertEquals(6, roots.size());
        assertEquals("手机数码", roots.getFirst().name());
        assertFalse(roots.getFirst().children().isEmpty());
        assertTrue(
                roots.getFirst().children().getFirst().children().stream()
                        .allMatch(n -> n.level() == 3));
    }

    @Test
    void create_underLevel3_rejected() {
        BusinessException ex =
                assertThrows(
                        BusinessException.class,
                        () -> categoryService.create(L3_PHONE, "四级类目", null, null));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    void create_duplicateName_conflict() {
        BusinessException ex =
                assertThrows(
                        BusinessException.class,
                        () -> categoryService.create(L1_DIGITAL, "手机通讯", null, null));
        assertEquals(409, ex.getHttpStatus());
    }

    @Test
    void disabledNode_prunedFromPublicTree() {
        Category created = categoryService.create(null, "临时类目", 99, null);
        categoryService.create(created.getId(), "临时子类目", null, null);

        categoryService.updateStatus(created.getId(), CategoryService.STATUS_DISABLED);

        List<CategoryNode> roots = categoryService.publicTree();
        assertTrue(roots.stream().noneMatch(n -> n.id().equals(created.getId())));
        // 管理端树仍可见（含禁用子树）
        assertTrue(
                categoryService.adminTree().stream().anyMatch(n -> n.id().equals(created.getId())));
    }
}
