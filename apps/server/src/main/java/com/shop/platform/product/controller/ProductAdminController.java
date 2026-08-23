package com.shop.platform.product.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.ShopIdHolder;
import com.shop.platform.product.dto.CreateProductRequest;
import com.shop.platform.product.dto.UpdateProductRequest;
import com.shop.platform.product.dto.UpdateSkusRequest;
import com.shop.platform.product.dto.UpdateSpecsRequest;
import com.shop.platform.product.mapper.ParamItem;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.mapper.SpecItem;
import com.shop.platform.product.service.ProductDetail;
import com.shop.platform.product.service.ProductService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
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

/** 卖家商品管理。出参一律 Response record：卖家端 zod schema 逐字段严格校验，字段镜像实体现状只减不增 */
@RestController
@RequestMapping("/seller/products")
@Validated
@RequiredArgsConstructor
public class ProductAdminController {
    private final ProductService productService;

    /** 创建商品草稿，返回含 id/createdAt 的出参。shopId 从店铺上下文（X-Shop-Id）取，不由前端传入 */
    @PostMapping
    public ProductResponse create(@Valid @RequestBody CreateProductRequest request) {
        return ProductResponse.from(productService.create(request.toCommand(ShopIdHolder.get())));
    }

    /** 更新规格并按新模板对账 SKU，返回当前全部 SKU（含新 id，供 updateSku 定位） */
    @PutMapping("/{id}/specs")
    public List<SkuResponse> updateSpecs(@PathVariable UUID id, @Valid @RequestBody UpdateSpecsRequest request) {
        return SkuResponse.from(productService.updateSpecs(id, request.specs()));
    }

    /** 批量更新 SKU 价格/库存，返回更新后的 SKU 列表 */
    @PutMapping("/{id}/skus")
    public List<SkuResponse> updateSkus(@PathVariable UUID id, @Valid @RequestBody UpdateSkusRequest request) {
        return SkuResponse.from(productService.updateSkus(id, request.items()));
    }

    /** 发布草稿，返回 status=1 且回填过价格区间的商品 */
    @PostMapping("/{id}/publish")
    public ProductResponse publish(@PathVariable UUID id) {
        return ProductResponse.from(productService.publish(id));
    }

    /** 商家后台商品列表：按当前店铺（X-Shop-Id）分页，可按状态/名称筛选 */
    @GetMapping
    public PageResult<ProductResponse> list(
            @Valid PageParams pageParams,
            @RequestParam(required = false) @Min(0) @Max(2) Integer status,
            @RequestParam(required = false) @Size(max = 128) String keyword) {
        PageResult<Product> page =
                productService.pageList(ShopIdHolder.get(), status, keyword, pageParams.page(), pageParams.size());
        return new PageResult<>(ProductResponse.from(page.records()), page.total());
    }

    /** 商品详情：SPU 全字段 + 全部 SKU，任何状态可查 */
    @GetMapping("/{id}")
    public ProductDetailResponse detail(@PathVariable UUID id) {
        return ProductDetailResponse.from(productService.detail(id));
    }

    /** 编辑基本信息（specs/SKU 之外的字段）；改规格走 PUT /{id}/specs */
    @PutMapping("/{id}")
    public ProductResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateProductRequest request) {
        return ProductResponse.from(productService.updateBasic(id, request.toCommand()));
    }

    /** 下架：仅上架商品可下架。不做物理删除，下架即"删除"语义 */
    @PostMapping("/{id}/off")
    public ProductResponse off(@PathVariable UUID id) {
        return ProductResponse.from(productService.off(id));
    }

    /** 重新上架：仅下架商品可上架，复检发布门槛（全部 SKU 已设价） */
    @PostMapping("/{id}/on")
    public ProductResponse on(@PathVariable UUID id) {
        return ProductResponse.from(productService.on(id));
    }

    // ========== HTTP 出参（与买家侧 ProductController 的同名 record 互不共享：方向不同契约不同） ==========

    /** SPU 全字段出参：草稿期 minPrice/maxPrice 可为 null */
    public record ProductResponse(
            UUID id,
            UUID shopId,
            UUID categoryId,
            String name,
            String subtitle,
            String description,
            String mainImage,
            List<String> images,
            List<SpecItem> specs,
            List<ParamItem> params,
            Long minPrice,
            Long maxPrice,
            Integer status,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {

        static ProductResponse from(Product p) {
            return new ProductResponse(
                    p.getId(),
                    p.getShopId(),
                    p.getCategoryId(),
                    p.getName(),
                    p.getSubtitle(),
                    p.getDescription(),
                    p.getMainImage(),
                    p.getImages(),
                    p.getSpecs(),
                    p.getParams(),
                    p.getMinPrice(),
                    p.getMaxPrice(),
                    p.getStatus(),
                    p.getCreatedAt(),
                    p.getUpdatedAt());
        }

        static List<ProductResponse> from(List<Product> list) {
            return list.stream().map(ProductResponse::from).toList();
        }
    }

    /** SKU 全字段出参：比买家侧多 skuCode/status（卖家要看到仓管编码与停用态）；价格裸分直传，与前端 schema 对齐 */
    public record SkuResponse(
            UUID id,
            UUID productId,
            String skuCode,
            String name,
            List<ParamItem> attributes,
            String image,
            Long price,
            Long originalPrice,
            String currency,
            Integer stock,
            Integer status,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {

        static SkuResponse from(Sku s) {
            return new SkuResponse(
                    s.getId(),
                    s.getProductId(),
                    s.getSkuCode(),
                    s.getName(),
                    s.getAttributes(),
                    s.getImage(),
                    s.getPrice(),
                    s.getOriginalPrice(),
                    s.getCurrency(),
                    s.getStock(),
                    s.getStatus(),
                    s.getCreatedAt(),
                    s.getUpdatedAt());
        }

        static List<SkuResponse> from(List<Sku> list) {
            return list.stream().map(SkuResponse::from).toList();
        }
    }

    /** 详情出参：SPU + 全部 SKU，替代 service 层的 ProductDetail（其内嵌 mapper 实体，不得越过 HTTP 边界） */
    public record ProductDetailResponse(ProductResponse product, List<SkuResponse> skus) {

        static ProductDetailResponse from(ProductDetail d) {
            return new ProductDetailResponse(ProductResponse.from(d.product()), SkuResponse.from(d.skus()));
        }
    }
}
