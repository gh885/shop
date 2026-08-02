package com.shop.platform.product.controller;

import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.service.ProductService;
import com.shop.platform.product.service.ProductService.CreateProductCommand;
import com.shop.platform.product.service.ProductService.ParamItem;
import com.shop.platform.product.service.ProductService.SkuUpdateItem;
import com.shop.platform.product.service.ProductService.SpecItem;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/products")
@RequiredArgsConstructor
public class ProductController {
    private final ProductService productService;

    /** 创建商品草稿，返回含 id/createdAt 的实体 */
    @PostMapping
    public Product create(@Valid @RequestBody CreateProductRequest request) {
        return productService.create(request.toCommand());
    }

    /** 更新规格并按新模板对账 SKU，返回当前全部 SKU（含新 id，供 updateSku 定位） */
    @PutMapping("/{id}/specs")
    public List<Sku> updateSpecs(
            @PathVariable UUID id, @Valid @RequestBody UpdateSpecsRequest request) {
        return productService.updateSpecs(id, request.specs());
    }

    /** 批量更新 SKU 价格/库存，返回更新后的 SKU 列表 */
    @PutMapping("/{id}/skus")
    public List<Sku> updateSkus(
            @PathVariable UUID id, @Valid @RequestBody UpdateSkusRequest request) {
        return productService.updateSkus(id, request.items());
    }

    /** 发布草稿，返回 status=1 且回填过价格区间的商品 */
    @PostMapping("/{id}/publish")
    public Product publish(@PathVariable UUID id) {
        return productService.publish(id);
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
            return new CreateProductCommand(
                    shopId, categoryId, name, subtitle, description, mainImage, images, params);
        }
    }

    /** 更新销售属性模板，请求体就是规格维度列表 */
    public record UpdateSpecsRequest(@NotEmpty List<@Valid SpecItem> specs) {}

    /** 批量更新 SKU 价格/库存，请求体是更新项列表 */
    public record UpdateSkusRequest(@NotEmpty List<@Valid SkuUpdateItem> items) {}
}
