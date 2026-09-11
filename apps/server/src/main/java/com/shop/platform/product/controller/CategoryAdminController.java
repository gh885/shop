package com.shop.platform.product.controller;

import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.product.controller.response.CategoryResponse;
import com.shop.platform.product.dto.CreateCategoryRequest;
import com.shop.platform.product.dto.UpdateCategoryRequest;
import com.shop.platform.product.dto.UpdateCategoryStatusRequest;
import com.shop.platform.product.service.CategoryNode;
import com.shop.platform.product.service.CategoryService;
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

/** 管理端类目维护（认证由 StaffAuthFilter 统一处理，授权要求 CATEGORY_MANAGE，岗位 OPS） */
@Tag(name = "categories-admin", description = "管理端类目维护")
@RestController
@RequestMapping("/admin/categories")
@RequiredArgsConstructor
@RequirePermission(Permissions.CATEGORY_MANAGE)
public class CategoryAdminController {

    private final CategoryService categoryService;

    /** 全量类目树（含禁用节点） */
    @GetMapping("/tree")
    public List<CategoryNode> getAdminCategoryTree() {
        return categoryService.adminTree();
    }

    @PostMapping
    public CategoryResponse createCategory(@Valid @RequestBody CreateCategoryRequest req) {
        return CategoryResponse.from(categoryService.create(req.parentId(), req.name(), req.sort(), req.iconUrl()));
    }

    @PutMapping("/{id}")
    public CategoryResponse updateCategory(@PathVariable UUID id, @Valid @RequestBody UpdateCategoryRequest req) {
        return CategoryResponse.from(categoryService.update(id, req.name(), req.sort(), req.iconUrl()));
    }

    @PutMapping("/{id}/status")
    public void updateCategoryStatus(@PathVariable UUID id, @Valid @RequestBody UpdateCategoryStatusRequest req) {
        categoryService.updateStatus(id, req.status());
    }
}
