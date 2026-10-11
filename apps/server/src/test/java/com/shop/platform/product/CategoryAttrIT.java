package com.shop.platform.product;

import static org.junit.jupiter.api.Assertions.*;

import com.shop.platform.common.BusinessException;
import com.shop.platform.product.mapper.CategoryAttr;
import com.shop.platform.product.mapper.CategoryAttrValue;
import com.shop.platform.product.model.AttrKind;
import com.shop.platform.product.model.CategoryAttrStatus;
import com.shop.platform.product.model.ParamItem;
import com.shop.platform.product.service.CategoryAttrNode;
import com.shop.platform.product.service.CategoryAttrService;
import com.shop.platform.product.service.ProductService;
import com.shop.platform.product.service.ProductService.CreateProductCommand;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** 类目属性模板集成验证：模板 CRUD / 值改名刷新 / 必填参数与值域校验。模板建在 V5 种子类目上，自建自清。 */
@SpringBootTest
class CategoryAttrIT extends IntegrationTestSupport {

    /** V5 种子：三级类目「智能手机」与一级类目「手机数码」 */
    private static final UUID L3_PHONE = UUID.fromString("01900000-0000-7000-8000-000000000301");

    /** V43 模板里「手机」自带的必填参数「屏幕尺寸」（attr 430103，值域 6.1/6.4/6.7 英寸）：放行用例必须带上 */
    private static final ParamItem SCREEN_SIZE =
            new ParamItem(UUID.fromString("01900000-0000-7000-8000-000000430103"), "屏幕尺寸", "6.1英寸");

    private static final UUID L1_DIGITAL = UUID.fromString("01900000-0000-7000-8000-000000000101");

    @Autowired
    private CategoryAttrService categoryAttrService;

    @Autowired
    private ProductService productService;

    /** 建模板属性（唯一名防重复跑撞唯一索引）并登记清理（父表在前） */
    private CategoryAttr seedAttr(UUID categoryId, String name, AttrKind kind, Boolean required, Boolean allowCustom) {
        CategoryAttr attr = categoryAttrService.createAttr(
                categoryId,
                name + UUID.randomUUID().toString().substring(0, 8),
                kind,
                required,
                allowCustom,
                null,
                null);
        db.onDelete(
                "DELETE FROM product.category_attrs WHERE id = ?::uuid",
                attr.getId().toString());
        db.onDelete(
                "DELETE FROM product.category_attr_values WHERE attr_id = ?::uuid",
                attr.getId().toString());
        return attr;
    }

    @Test
    void 模板CRUD_改名排序_禁用后公开模板裁剪() {
        CategoryAttr attr = seedAttr(L3_PHONE, "颜色", AttrKind.SPEC, null, null);
        CategoryAttrValue black = categoryAttrService.addValue(attr.getId(), "黑", 1, null);
        categoryAttrService.addValue(attr.getId(), "白", 2, null);

        // 1. 模板组装：attr + values 按 sort 排序
        List<CategoryAttrNode> template = categoryAttrService.listTemplate(L3_PHONE);
        CategoryAttrNode node = template.stream()
                .filter(n -> n.attr().getId().equals(attr.getId()))
                .findFirst()
                .orElseThrow();
        assertEquals(2, node.values().size());
        assertEquals("黑", node.values().getFirst().getValue());

        // 2. 改名/改排序透传
        CategoryAttrValue renamed = categoryAttrService.updateValue(black.getId(), "曜石黑", 0, null);
        assertEquals("曜石黑", renamed.getValue());

        // 3. 禁用后：管理端模板仍可见，公开模板裁剪
        categoryAttrService.updateAttrStatus(attr.getId(), CategoryAttrStatus.DISABLED);
        assertTrue(categoryAttrService.listTemplate(L3_PHONE).stream()
                .anyMatch(n -> n.attr().getId().equals(attr.getId())));
        assertTrue(categoryAttrService.publicTemplate(L3_PHONE).stream()
                .noneMatch(n -> n.attr().getId().equals(attr.getId())));
    }

    @Test
    void 非叶子类目挂模板_400() {
        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> categoryAttrService.createAttr(L1_DIGITAL, "颜色", AttrKind.SPEC, null, null, null, null));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    void 同类目同名属性_409带name字段错() {
        CategoryAttr attr = seedAttr(L3_PHONE, "颜色", AttrKind.SPEC, null, null);
        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> categoryAttrService.createAttr(L3_PHONE, attr.getName(), AttrKind.SPEC, null, null, null, null));
        assertEquals(409, ex.getHttpStatus());
        // 撞键带上 errors[field]，前端据此把这句话标到「属性名」输入框上
        assertEquals(List.of(Map.of("field", "name", "message", "该类目下已存在同名属性")), ex.getErrors());
    }

    @Test
    void 必填参数缺失_400() {
        CategoryAttr param = seedAttr(L3_PHONE, "产地", AttrKind.PARAM, true, null);
        UUID shopId = UUID.randomUUID();
        db.onDelete("DELETE FROM product.products WHERE shop_id = ?::uuid", shopId.toString());

        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> productService.create(new CreateProductCommand(
                        shopId, L3_PHONE, "必填参数测试机", null, null, null, List.of(), List.of(), null)));
        assertEquals(400, ex.getHttpStatus());

        // 补上必填参数后放行（连同 V43 模板里手机类目自带的必填「屏幕尺寸」）
        assertDoesNotThrow(() -> productService.create(new CreateProductCommand(
                shopId,
                L3_PHONE,
                "必填参数测试机",
                null,
                null,
                null,
                List.of(),
                List.of(new ParamItem(param.getId(), "产地", "广东"), SCREEN_SIZE),
                null)));
    }

    @Test
    void 参数值域受控_域外值_400() {
        CategoryAttr param = seedAttr(L3_PHONE, "网络制式", AttrKind.PARAM, null, false);
        categoryAttrService.addValue(param.getId(), "5G", null, null);
        UUID shopId = UUID.randomUUID();
        db.onDelete("DELETE FROM product.products WHERE shop_id = ?::uuid", shopId.toString());

        // allow_custom=false 且有值域：域外自由文本拒绝
        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> productService.create(new CreateProductCommand(
                        shopId,
                        L3_PHONE,
                        "值域测试机",
                        null,
                        null,
                        null,
                        List.of(),
                        List.of(new ParamItem(param.getId(), "网络制式", "6G")),
                        null)));
        assertEquals(400, ex.getHttpStatus());

        // 值域内的值放行
        assertDoesNotThrow(() -> productService.create(new CreateProductCommand(
                shopId,
                L3_PHONE,
                "值域测试机",
                null,
                null,
                null,
                List.of(),
                List.of(new ParamItem(param.getId(), "网络制式", "5G"), SCREEN_SIZE),
                null)));
    }

    @Test
    void 参数attrId不属于模板_400() {
        seedAttr(L3_PHONE, "产地", AttrKind.PARAM, null, null);
        UUID shopId = UUID.randomUUID();
        db.onDelete("DELETE FROM product.products WHERE shop_id = ?::uuid", shopId.toString());

        // 类目已有模板时，自由文本（attrId=null）与外来 attrId 都拒绝
        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> productService.create(new CreateProductCommand(
                        shopId,
                        L3_PHONE,
                        "自由文本测试机",
                        null,
                        null,
                        null,
                        List.of(),
                        List.of(new ParamItem(null, "产地", "广东")),
                        null)));
        assertEquals(400, ex.getHttpStatus());
    }
}
