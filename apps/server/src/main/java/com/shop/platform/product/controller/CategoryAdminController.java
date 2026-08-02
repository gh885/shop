package com.shop.platform.product.controller;

import com.shop.platform.product.mapper.Category;
import com.shop.platform.product.service.CategoryService;
import com.shop.platform.product.service.CategoryService.CategoryNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
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

/** 管理端类目维护。TODO(admin 模块落地后): 接入管理员鉴权 */
@RestController
@RequestMapping("/admin/categories")
@RequiredArgsConstructor
public class CategoryAdminController {

    private final CategoryService categoryService;

    /** 全量类目树（含禁用节点） */
    @GetMapping("/tree")
    public List<CategoryNode> tree() {
        return categoryService.adminTree();
    }

    @PostMapping
    public Category create(@Valid @RequestBody CreateCategoryRequest req) {
        return categoryService.create(req.parentId(), req.name(), req.sort(), req.iconUrl());
    }

    @PutMapping("/{id}")
    public Category update(@PathVariable UUID id, @Valid @RequestBody UpdateCategoryRequest req) {
        return categoryService.update(id, req.name(), req.sort(), req.iconUrl());
    }

    @PutMapping("/{id}/status")
    public void updateStatus(@PathVariable UUID id, @Valid @RequestBody UpdateStatusRequest req) {
        categoryService.updateStatus(id, req.status());
    }

    // ---- Request DTOs ----

    public record CreateCategoryRequest(
            UUID parentId, @NotBlank @Size(max = 64) String name, Integer sort, @Size(max = 255) String iconUrl) {
        public CreateCategoryRequest {
            if (name != null) name = name.trim();
        }
    }

    public record UpdateCategoryRequest(
            @NotBlank @Size(max = 64) String name, Integer sort, @Size(max = 255) String iconUrl) {
        public UpdateCategoryRequest {
            if (name != null) name = name.trim();
        }
    }

    public record UpdateStatusRequest(@NotNull @Min(0) @Max(1) Integer status) {}
}
