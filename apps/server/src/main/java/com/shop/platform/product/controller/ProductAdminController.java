package com.shop.platform.product.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.ShopIdHolder;
import com.shop.platform.product.dto.CreateProductRequest;
import com.shop.platform.product.dto.UpdateProductRequest;
import com.shop.platform.product.dto.UpdateSkusRequest;
import com.shop.platform.product.dto.UpdateSpecsRequest;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.service.ProductDetail;
import com.shop.platform.product.service.ProductService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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

    /** 创建商品草稿，返回含 id/createdAt 的实体。shopId 从店铺上下文（X-Shop-Id）取，不由前端传入 */
    @PostMapping
    public Product create(@Valid @RequestBody CreateProductRequest request) {
        return productService.create(request.toCommand(ShopIdHolder.get()));
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

    /** 商家后台商品列表：按当前店铺（X-Shop-Id）分页，可按状态/名称筛选 */
    @GetMapping
    public PageResult<Product> list(
            @Valid PageParams pageParams,
            @RequestParam(required = false) @Min(0) @Max(2) Integer status,
            @RequestParam(required = false) @Size(max = 128) String keyword) {
        return productService.pageList(ShopIdHolder.get(), status, keyword, pageParams.page(), pageParams.size());
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
}
