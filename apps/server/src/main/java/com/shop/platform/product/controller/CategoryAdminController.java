package com.shop.platform.product.controller;

import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.product.dto.CreateCategoryRequest;
import com.shop.platform.product.dto.UpdateCategoryRequest;
import com.shop.platform.product.dto.UpdateStatusRequest;
import com.shop.platform.product.mapper.Category;
import com.shop.platform.product.service.CategoryService;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
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
@RestController
@RequestMapping("/admin/categories")
@RequiredArgsConstructor
@RequirePermission(Permissions.CATEGORY_MANAGE)
public class CategoryAdminController {

    private final CategoryService categoryService;

    /** 全量类目树（含禁用节点） */
    @GetMapping("/tree")
    public List<CategoryNodeResponse> tree() {
        return categoryService.adminTree().stream()
                .map(CategoryNodeResponse::from)
                .toList();
    }

    @PostMapping
    public CategoryResponse create(@Valid @RequestBody CreateCategoryRequest req) {
        return CategoryResponse.from(categoryService.create(req.parentId(), req.name(), req.sort(), req.iconUrl()));
    }

    @PutMapping("/{id}")
    public CategoryResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateCategoryRequest req) {
        return CategoryResponse.from(categoryService.update(id, req.name(), req.sort(), req.iconUrl()));
    }

    @PutMapping("/{id}/status")
    public void updateStatus(@PathVariable UUID id, @Valid @RequestBody UpdateStatusRequest req) {
        categoryService.updateStatus(id, req.status());
    }

    /** 类目出参：字段镜像实体现状；树形展示走 service 的 CategoryNode（含 children），此处为单节点 CRUD 回显 */
    public record CategoryResponse(
            UUID id,
            UUID parentId,
            String name,
            Integer level,
            Integer sort,
            Integer status,
            String iconUrl,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {

        static CategoryResponse from(Category c) {
            return new CategoryResponse(
                    c.getId(),
                    c.getParentId(),
                    c.getName(),
                    c.getLevel(),
                    c.getSort(),
                    c.getStatus(),
                    c.getIconUrl(),
                    c.getCreatedAt(),
                    c.getUpdatedAt());
        }
    }
}
