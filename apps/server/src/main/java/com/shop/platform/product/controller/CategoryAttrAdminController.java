package com.shop.platform.product.controller;

import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.product.controller.response.CategoryAttrNodeResponse;
import com.shop.platform.product.controller.response.CategoryAttrResponse;
import com.shop.platform.product.controller.response.CategoryAttrValueResponse;
import com.shop.platform.product.dto.CategoryAttrRequest;
import com.shop.platform.product.dto.CategoryAttrValueRequest;
import com.shop.platform.product.dto.UpdateCategoryAttrStatusRequest;
import com.shop.platform.product.service.CategoryAttrService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理端类目属性模板维护（认证由 StaffAuthFilter 统一处理，授权复用 CATEGORY_MANAGE，岗位 OPS）。
 *
 * <p>独立于 CategoryAdminController：模板端点横跨 /admin/categories/{id}/attrs 与 /admin/category-attrs/{attrId}
 * 两棵路径，类级 @RequestMapping 无法同栖，按路径前缀拆类。
 */
@Tag(name = "categories-admin", description = "管理端类目维护")
@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
@RequirePermission(Permissions.CATEGORY_MANAGE)
public class CategoryAttrAdminController {

    private final CategoryAttrService categoryAttrService;

    /** 类目属性模板（全量属性含禁用 + 值域） */
    @GetMapping("/categories/{id}/attrs")
    public List<CategoryAttrNodeResponse> getCategoryAttrTemplate(@PathVariable UUID id) {
        return categoryAttrService.listTemplate(id).stream()
                .map(CategoryAttrNodeResponse::from)
                .toList();
    }

    /** 新建模板属性（只允许叶子类目） */
    @PostMapping("/categories/{id}/attrs")
    public CategoryAttrResponse createCategoryAttr(@PathVariable UUID id, @Valid @RequestBody CategoryAttrRequest req) {
        return CategoryAttrResponse.from(categoryAttrService.createAttr(
                id, req.name(), req.kind(), req.required(), req.allowCustom(), req.allowImage(), req.sort()));
    }

    /** 更新属性定义（kind 创建后不可改，见 service） */
    @PutMapping("/category-attrs/{attrId}")
    public CategoryAttrResponse updateCategoryAttr(
            @PathVariable UUID attrId, @Valid @RequestBody CategoryAttrRequest req) {
        return CategoryAttrResponse.from(categoryAttrService.updateAttr(
                attrId, req.name(), req.required(), req.allowCustom(), req.allowImage(), req.sort()));
    }

    /** 启用/禁用属性（同 categories 语义：查询侧裁剪，不写扩散） */
    @PutMapping("/category-attrs/{attrId}/status")
    public void updateCategoryAttrStatus(
            @PathVariable UUID attrId, @Valid @RequestBody UpdateCategoryAttrStatusRequest req) {
        categoryAttrService.updateAttrStatus(attrId, req.status());
    }

    /** 平台预置值建档 */
    @PostMapping("/category-attrs/{attrId}/values")
    public CategoryAttrValueResponse createCategoryAttrValue(
            @PathVariable UUID attrId, @Valid @RequestBody CategoryAttrValueRequest req) {
        return CategoryAttrValueResponse.from(
                categoryAttrService.addValue(attrId, req.value(), req.sort(), req.image()));
    }

    /** 改值名/排序：改名同事务刷新引用 SKU 的 attributes/name 快照（改名不丢价） */
    @PutMapping("/category-attr-values/{valueId}")
    public CategoryAttrValueResponse updateCategoryAttrValue(
            @PathVariable UUID valueId, @Valid @RequestBody CategoryAttrValueRequest req) {
        return CategoryAttrValueResponse.from(
                categoryAttrService.updateValue(valueId, req.value(), req.sort(), req.image()));
    }
}
