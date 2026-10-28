package com.shop.platform.catalog.controller;

import com.shop.platform.catalog.dto.CategoryTreeNode;
import com.shop.platform.catalog.dto.CreateCategoryRequest;
import com.shop.platform.catalog.dto.UpdateCategoryStatusRequest;
import com.shop.platform.catalog.model.CategoryConfig;
import com.shop.platform.catalog.service.CatalogConfigService;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台类目配置。只有 staff 身份能写，靠 {@code CATEGORY_MANAGE} 权限点判。
 *
 * <p>路径前缀 {@code /api/admin}：三端各自独立的入口是既定做法（卖家用 /api/seller、
 * 买家走 /api，平台用 /api/admin），不合成一个"看身份分流"的接口——
 * 那样每个 handler 都要先问"你是谁"，而权限判断本该在拦截层做完。
 */
@RestController
@RequestMapping("/api/admin/categories")
public class AdminCategoryController {

    private final CatalogConfigService config;
    private final Authorizer authorizer;

    public AdminCategoryController(CatalogConfigService config, Authorizer authorizer) {
        this.config = config;
        this.authorizer = authorizer;
    }

    @GetMapping("/tree")
    public List<CategoryTreeNode> tree() {
        authorizer.check(Permission.CATEGORY_MANAGE);
        return config.tree();
    }

    /** 叶子的配置。分组类目没有配置，返回 404。 */
    @GetMapping("/{categoryId}/config")
    public CategoryConfig config(@PathVariable UUID categoryId) {
        authorizer.check(Permission.CATEGORY_MANAGE);
        return config.config(categoryId);
    }

    @PostMapping
    public CreateCategoryResponse createCategory(@Valid @RequestBody CreateCategoryRequest request) {
        authorizer.check(Permission.CATEGORY_MANAGE);
        return new CreateCategoryResponse(config.create(request));
    }

    @PostMapping("/{categoryId}/attributes")
    public void addAttributes(@PathVariable UUID categoryId, @Valid @RequestBody AddAttributesRequest request) {
        authorizer.check(Permission.CATEGORY_MANAGE);
        config.addAttributes(categoryId, request.attributes());
    }

    @PutMapping("/{categoryId}/status")
    public void updateCategoryStatus(
            @PathVariable UUID categoryId, @Valid @RequestBody UpdateCategoryStatusRequest request) {
        authorizer.check(Permission.CATEGORY_MANAGE);
        config.updateStatus(categoryId, com.shop.platform.catalog.model.CategoryStatus.from(request.status()));
    }

    @PutMapping("/{categoryId}/sort")
    public void updateSort(@PathVariable UUID categoryId, @Valid @RequestBody UpdateSortRequest request) {
        authorizer.check(Permission.CATEGORY_MANAGE);
        config.updateSort(categoryId, request.sort());
    }

    @PutMapping("/{categoryId}/name")
    public void rename(@PathVariable UUID categoryId, @Valid @RequestBody RenameRequest request) {
        authorizer.check(Permission.CATEGORY_MANAGE);
        config.rename(categoryId, request.name());
    }

    public record CreateCategoryResponse(UUID categoryId) {}

    public record AddAttributesRequest(@Valid List<CreateCategoryRequest.AttributeRequest> attributes) {}

    public record UpdateSortRequest(int sort) {}

    public record RenameRequest(@jakarta.validation.constraints.NotBlank String name) {}
}
