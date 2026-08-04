package com.shop.platform.product.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.product.mapper.ParamItem;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.mapper.SpecItem;
import com.shop.platform.product.service.ProductService;
import com.shop.platform.product.service.ProductService.CreateProductCommand;
import com.shop.platform.product.service.ProductService.ProductDetail;
import com.shop.platform.product.service.ProductService.SkuUpdateItem;
import com.shop.platform.product.service.ProductService.UpdateBasicCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/seller/products")
@Validated
@RequiredArgsConstructor
public class ProductAdminController {
    private final ProductService productService;

    /** 创建商品草稿，返回含 id/createdAt 的实体 */
    @PostMapping
    public Product create(@Valid @RequestBody CreateProductRequest request) {
        return productService.create(request.toCommand());
    }

    /** 更新规格并按新模板对账 SKU，返回当前全部 SKU（含新 id，供 updateSku 定位） */
    @PutMapping("/{id}/specs")
    public List<Sku> updateSpecs(@PathVariable UUID id, @Valid @RequestBody UpdateSpecsRequest request) {
        return productService.updateSpecs(id, request.specs());
    }

    /** 批量更新 SKU 价格/库存，返回更新后的 SKU 列表 */
    @PutMapping("/{id}/skus")
    public List<Sku> updateSkus(@PathVariable UUID id, @Valid @RequestBody UpdateSkusRequest request) {
        return productService.updateSkus(id, request.items());
    }

    /** 发布草稿，返回 status=1 且回填过价格区间的商品 */
    @PostMapping("/{id}/publish")
    public Product publish(@PathVariable UUID id) {
        return productService.publish(id);
    }

    /** 商家后台商品列表：按店铺分页，可按状态/名称筛选 */
    @GetMapping
    public Page<Product> list(
            @RequestParam @NotNull UUID shopId,
            @RequestParam(required = false) @Min(0) @Max(2) Integer status,
            @RequestParam(required = false) @Size(max = 128) String keyword,
            @RequestParam(defaultValue = "1") @Min(1) long page,
            @RequestParam(defaultValue = "10") @Min(1) @Max(100) long size) {
        return productService.pageList(shopId, status, keyword, page, size);
    }

    /** 商品详情：SPU 全字段 + 全部 SKU，任何状态可查 */
    @GetMapping("/{id}")
    public ProductDetail detail(@PathVariable UUID id) {
        return productService.detail(id);
    }

    /** 编辑基本信息（specs/SKU 之外的字段）；改规格走 PUT /{id}/specs */
    @PutMapping("/{id}")
    public Product update(@PathVariable UUID id, @Valid @RequestBody UpdateProductRequest request) {
        return productService.updateBasic(id, request.toCommand());
    }

    /** 下架：仅上架商品可下架。不做物理删除，下架即"删除"语义 */
    @PostMapping("/{id}/off")
    public Product off(@PathVariable UUID id) {
        return productService.off(id);
    }

    /** 重新上架：仅下架商品可上架，复检发布门槛（全部 SKU 已设价） */
    @PostMapping("/{id}/on")
    public Product on(@PathVariable UUID id) {
        return productService.on(id);
    }

    // ---- Request DTOs ----

    /** 创建商品草稿：只存基本信息，specs/SKU 由后续接口单独处理 */
    public record CreateProductRequest(
            /** 店铺 ID。暂无店铺模块/鉴权，先由前端传入；接入后改为从登录上下文取 */
            @NotNull UUID shopId,
            /** 主分类 ID */
            @NotNull UUID categoryId,
            @NotBlank @Size(max = 128) String name,
            @Size(max = 255) String subtitle,
            /** 详情富文本，TEXT 无长度上限，且请求体有 RequestBodySizeFilter 兜底 */
            String description,
            @Size(max = 255) String mainImage,
            List<@Size(max = 255) String> images,
            /** 非销售参数，可空：[] */
            List<@Valid ParamItem> params) {
        public CreateProductRequest {
            if (name != null) name = name.trim();
            if (subtitle != null) subtitle = subtitle.trim();
        }

        /** 映射为 service 入参。两契约字段一致，直接对齐 */
        CreateProductCommand toCommand() {
            return new CreateProductCommand(shopId, categoryId, name, subtitle, description, mainImage, images, params);
        }
    }

    /** 编辑商品基本信息：与创建同字段，去掉 shopId（店铺归属创建后不可改） */
    public record UpdateProductRequest(
            /** 主分类 ID */
            @NotNull UUID categoryId,
            @NotBlank @Size(max = 128) String name,
            @Size(max = 255) String subtitle,
            String description,
            @Size(max = 255) String mainImage,
            List<@Size(max = 255) String> images,
            List<@Valid ParamItem> params) {
        public UpdateProductRequest {
            if (name != null) name = name.trim();
            if (subtitle != null) subtitle = subtitle.trim();
        }

        /** 映射为 service 入参 */
        UpdateBasicCommand toCommand() {
            return new UpdateBasicCommand(categoryId, name, subtitle, description, mainImage, images, params);
        }
    }

    /** 更新销售属性模板，请求体就是规格维度列表 */
    public record UpdateSpecsRequest(@NotEmpty List<@Valid SpecItem> specs) {}

    /** 批量更新 SKU 价格/库存，请求体是更新项列表 */
    public record UpdateSkusRequest(@NotEmpty List<@Valid SkuUpdateItem> items) {}
}
