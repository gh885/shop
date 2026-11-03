package com.shop.platform.catalog.controller;

import com.shop.platform.catalog.dto.CategoryTreeNode;
import com.shop.platform.catalog.dto.CreateAttributeValueRequest;
import com.shop.platform.catalog.dto.CreateCategoryRequest;
import com.shop.platform.catalog.dto.UpdateAttributeValueRequest;
import com.shop.platform.catalog.dto.UpdateCategoryAttributeRequest;
import com.shop.platform.catalog.dto.UpdateCategoryConfigRequest;
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
        authorizer.platform(Permission.CATEGORY_CONFIGURE);
        return config.tree();
    }

    /** 叶子的配置。分组类目没有配置，返回 404。 */
    @GetMapping("/{categoryId}/config")
    public CategoryConfig config(@PathVariable UUID categoryId) {
        authorizer.platform(Permission.CATEGORY_CONFIGURE);
        return config.config(categoryId);
    }

    @PostMapping
    public CreateCategoryResponse createCategory(@Valid @RequestBody CreateCategoryRequest request) {
        authorizer.platform(Permission.CATEGORY_CONFIGURE);
        return new CreateCategoryResponse(
                config.create(request, authorizer.current().operatorId()));
    }

    @PostMapping("/{categoryId}/attributes")
    public void addAttributes(@PathVariable UUID categoryId, @Valid @RequestBody AddAttributesRequest request) {
        authorizer.platform(Permission.CATEGORY_CONFIGURE);
        config.addAttributes(
                categoryId, request.attributes(), authorizer.current().operatorId());
    }

    /**
     * 改叶子配置（识别键、品牌策略、资质、免审）。
     *
     * <p>识别键 / 匹配策略 / SKU 识别键在类目有商品之后锁死——改它们会让存量商品的
     * {@code match_key} 与 {@code sku.identity_key} 全部失效。
     */
    @PutMapping("/{categoryId}/config")
    public void updateConfig(@PathVariable UUID categoryId, @Valid @RequestBody UpdateCategoryConfigRequest request) {
        authorizer.platform(Permission.CATEGORY_CONFIGURE);
        config.updateConfig(categoryId, request, authorizer.current().operatorId());
    }

    /**
     * 改属性模板的可编辑元数据（名称、必填、筛选、多选、排序、上下线）。
     *
     * <p>属性只增不删；类型 / 单位 / 值域 / 识别 / 规格标记不在可改范围——它们改的是身份键
     * 和 SKU 维度。
     */
    @PutMapping("/{categoryId}/attributes/{attributeId}")
    public void updateAttribute(
            @PathVariable UUID categoryId,
            @PathVariable UUID attributeId,
            @Valid @RequestBody UpdateCategoryAttributeRequest request) {
        authorizer.platform(Permission.CATEGORY_CONFIGURE);
        config.updateAttribute(
                categoryId, attributeId, request, authorizer.current().operatorId());
    }

    @PostMapping("/{categoryId}/attributes/{attributeId}/values")
    public CreateAttributeValueResponse createAttributeValue(
            @PathVariable UUID categoryId,
            @PathVariable UUID attributeId,
            @Valid @RequestBody CreateAttributeValueRequest request) {
        authorizer.platform(Permission.CATEGORY_CONFIGURE);
        UUID valueId = config.addValue(
                categoryId, attributeId, request, authorizer.current().operatorId());
        return new CreateAttributeValueResponse(valueId);
    }

    /** 值文本不可改；只改图片、排序、启停。 */
    @PutMapping("/{categoryId}/attributes/{attributeId}/values/{valueId}")
    public void updateAttributeValue(
            @PathVariable UUID categoryId,
            @PathVariable UUID attributeId,
            @PathVariable UUID valueId,
            @Valid @RequestBody UpdateAttributeValueRequest request) {
        authorizer.platform(Permission.CATEGORY_CONFIGURE);
        config.updateValue(
                categoryId, attributeId, valueId, request, authorizer.current().operatorId());
    }

    @PutMapping("/{categoryId}/status")
    public void updateCategoryStatus(
            @PathVariable UUID categoryId, @Valid @RequestBody UpdateCategoryStatusRequest request) {
        authorizer.platform(Permission.CATEGORY_CONFIGURE);
        config.updateStatus(
                categoryId,
                com.shop.platform.catalog.model.CategoryStatus.from(request.status()),
                authorizer.current().operatorId());
    }

    @PutMapping("/{categoryId}/sort")
    public void updateSort(@PathVariable UUID categoryId, @Valid @RequestBody UpdateSortRequest request) {
        authorizer.platform(Permission.CATEGORY_CONFIGURE);
        config.updateSort(categoryId, request.sort(), authorizer.current().operatorId());
    }

    @PutMapping("/{categoryId}/name")
    public void rename(@PathVariable UUID categoryId, @Valid @RequestBody RenameRequest request) {
        authorizer.platform(Permission.CATEGORY_CONFIGURE);
        config.rename(categoryId, request.name(), authorizer.current().operatorId());
    }

    public record CreateCategoryResponse(UUID categoryId) {}

    public record CreateAttributeValueResponse(UUID valueId) {}

    public record AddAttributesRequest(
            @jakarta.validation.constraints.NotEmpty @Valid List<CreateCategoryRequest.AttributeRequest> attributes) {}

    public record UpdateSortRequest(int sort) {}

    public record RenameRequest(@jakarta.validation.constraints.NotBlank String name) {}
}
