package com.shop.platform.product.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Permissions;
import com.shop.platform.infra.qiniu.QiniuClient;
import com.shop.platform.infra.qiniu.UploadTicket;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentShop;
import com.shop.platform.inventory.api.StockReadQuery;
import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.dto.CreateProductRequest;
import com.shop.platform.product.dto.UpdateProductRequest;
import com.shop.platform.product.dto.UpdateSkusRequest;
import com.shop.platform.product.dto.UpdateSpecsRequest;
import com.shop.platform.product.mapper.ParamItem;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.mapper.SkuAttr;
import com.shop.platform.product.mapper.SpecItem;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.product.model.SkuStatus;
import com.shop.platform.product.service.ProductDetail;
import com.shop.platform.product.service.ProductService;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
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

/** 卖家商品管理（授权要求 PRODUCT_MANAGE，读随写权）。出参一律 Response record：卖家端 zod schema 逐字段严格校验，字段镜像实体现状只减不增 */
@Tag(name = "products-admin", description = "卖家商品管理")
@RestController
@RequestMapping("/seller/products")
@Validated
@RequiredArgsConstructor
@RequirePermission(Permissions.PRODUCT_MANAGE)
public class ProductAdminController {
    private final ProductService productService;
    private final StockReadQuery stockReadQuery;
    private final QiniuClient qiniuClient;

    /** 商品图上传凭证：前端拿 ticket 后直传七牛，传完把 key 写进商品的 mainImage / images / detailImages */
    @PostMapping("/image-ticket")
    public ImageTicketResponse issueImageTicket(@RequestParam String ext) {
        return ImageTicketResponse.from(qiniuClient.issueTicket("product", ext));
    }

    /** 创建商品草稿，返回含 id/createdAt 的出参。shopId 从店铺上下文（X-Shop-Id）取，不由前端传入 */
    @PostMapping
    public ProductResponse createProduct(@CurrentShop UUID shopId, @Valid @RequestBody CreateProductRequest request) {
        return ProductResponse.from(productService.create(request.toCommand(shopId)));
    }

    /** 提交规格选择并按 valueId 组合（spec_key）对账 SKU，返回当前全部 SKU（含新 id，供 updateSku 定位） */
    @PutMapping("/{id}/specs")
    public List<SkuResponse> updateProductSpecs(@PathVariable UUID id, @Valid @RequestBody UpdateSpecsRequest request) {
        List<Sku> skus = productService.updateSpecs(id, request.toSelections());
        return SkuResponse.from(skus, stocks(skus));
    }

    /** 批量更新 SKU 价格/库存，返回更新后的 SKU 列表 */
    @PutMapping("/{id}/skus")
    public List<SkuResponse> updateProductSkus(@PathVariable UUID id, @Valid @RequestBody UpdateSkusRequest request) {
        List<Sku> skus = productService.updateSkus(id, request.items());
        return SkuResponse.from(skus, stocks(skus));
    }

    /** 发布草稿，返回 status=PUBLISHED 且回填过价格区间的商品 */
    @PostMapping("/{id}/publish")
    public ProductResponse publishProduct(@PathVariable UUID id) {
        return ProductResponse.from(productService.publish(id));
    }

    /** 商家后台商品列表：按当前店铺（X-Shop-Id）分页，可按状态/名称筛选 */
    @GetMapping
    public PageResult<ProductResponse> listShopProducts(
            @CurrentShop UUID shopId,
            @Valid PageParams pageParams,
            @RequestParam(required = false) ProductStatus status,
            @RequestParam(required = false) @Size(max = 128) String keyword) {
        return productService
                .pageList(shopId, status, keyword, pageParams.page(), pageParams.size())
                .map(ProductResponse::from);
    }

    /** 商品详情：SPU 全字段 + 全部 SKU，任何状态可查 */
    @GetMapping("/{id}")
    public ProductDetailResponse getShopProductDetail(@PathVariable UUID id) {
        ProductDetail d = productService.detail(id);
        return ProductDetailResponse.from(d, stocks(d.skus()));
    }

    /** 编辑基本信息（specs/SKU 之外的字段）；改规格走 PUT /{id}/specs */
    @PutMapping("/{id}")
    public ProductResponse updateProduct(@PathVariable UUID id, @Valid @RequestBody UpdateProductRequest request) {
        return ProductResponse.from(productService.updateBasic(id, request.toCommand()));
    }

    /** 下架：仅上架商品可下架。不做物理删除，下架即"删除"语义 */
    @PostMapping("/{id}/off")
    public ProductResponse offProduct(@PathVariable UUID id) {
        return ProductResponse.from(productService.off(id));
    }

    /** 重新上架：仅下架商品可上架，复检发布门槛（全部 SKU 已设价） */
    @PostMapping("/{id}/on")
    public ProductResponse onProduct(@PathVariable UUID id) {
        return ProductResponse.from(productService.on(id));
    }

    // ========== HTTP 出参（与买家侧 ProductController 的同名 record 互不共享：方向不同契约不同） ==========

    /** SPU 全字段出参：草稿期 minPrice/maxPrice 可为 null */
    public record ProductResponse(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID shopId,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID categoryId,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
            String subtitle,
            List<String> detailImages,
            String mainImage,
            List<String> images,
            List<SpecItem> specs,
            List<ParamItem> params,
            Long minPrice,
            Long maxPrice,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) ProductStatus status,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime createdAt,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime updatedAt) {

        static ProductResponse from(Product p) {
            return new ProductResponse(
                    p.getId(),
                    p.getShopId(),
                    p.getCategoryId(),
                    p.getName(),
                    p.getSubtitle(),
                    p.getDetailImages(),
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

    /** 商品图上传凭证：前端 PUT 到 uploadUrl（Authorization: UpToken <token>），传完用 url/key 存进商品图字段 */
    public record ImageTicketResponse(String uploadUrl, String key, String token, String url) {

        /** 镜像 infra 共享值对象 {@link UploadTicket}：拼装逻辑只留一份，HTTP 边界保留自家契约 */
        static ImageTicketResponse from(UploadTicket t) {
            return new ImageTicketResponse(t.uploadUrl(), t.key(), t.token(), t.url());
        }
    }

    /** SKU 全字段出参：比买家侧多 skuCode/status（卖家要看到仓管编码与停用态）；价格裸分直传，与前端 schema 对齐 */
    public record SkuResponse(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID productId,
            String skuCode,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
            List<SkuAttr> attributes,
            String image,
            Long price,
            Long originalPrice,
            String currency,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Integer stock,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) SkuStatus status,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime createdAt,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime updatedAt) {

        static SkuResponse from(Sku s, StockView stock) {
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
                    stock == null ? 0 : stock.availableStock(),
                    s.getStatus(),
                    s.getCreatedAt(),
                    s.getUpdatedAt());
        }

        /** 批量转换：按 skuId 从库存 Map 取 availableStock，缺省 0。库存归 inventory 模块，不写 product 表 */
        static List<SkuResponse> from(List<Sku> list, Map<UUID, StockView> stocks) {
            return list.stream()
                    .map(s -> SkuResponse.from(s, stocks.get(s.getId())))
                    .toList();
        }
    }

    /** 详情出参：SPU + 全部 SKU，替代 service 层的 ProductDetail（其内嵌 mapper 实体，不得越过 HTTP 边界） */
    public record ProductDetailResponse(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) ProductResponse product,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<SkuResponse> skus) {

        static ProductDetailResponse from(ProductDetail d, Map<UUID, StockView> stocks) {
            return new ProductDetailResponse(ProductResponse.from(d.product()), SkuResponse.from(d.skus(), stocks));
        }
    }

    /** 跨模块批查库存：skuId → StockView，供 SkuResponse 补库存展示（卖家端） */
    private Map<UUID, StockView> stocks(List<Sku> skus) {
        return stockReadQuery.availableBySkuIds(skus.stream().map(Sku::getId).toList());
    }
}
