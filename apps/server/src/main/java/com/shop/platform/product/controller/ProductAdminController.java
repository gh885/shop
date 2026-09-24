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
import com.shop.platform.product.controller.response.ProductDetailResponse;
import com.shop.platform.product.controller.response.ProductResponse;
import com.shop.platform.product.controller.response.SkuResponse;
import com.shop.platform.product.dto.CreateProductRequest;
import com.shop.platform.product.dto.ProductFieldRules;
import com.shop.platform.product.dto.UpdateProductRequest;
import com.shop.platform.product.dto.UpdateSkusRequest;
import com.shop.platform.product.dto.UpdateSpecsRequest;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.product.service.ProductDetail;
import com.shop.platform.product.service.ProductQueryService;
import com.shop.platform.product.service.ProductService;
import com.shop.platform.product.service.SkuService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 卖家商品管理（授权要求 PRODUCT_MANAGE，读随写权）。业务出参一律 Response record：卖家端 zod schema 逐字段严格校验，字段镜像实体现状只减不增；上传凭证直出 infra 值对象 UploadTicket */
@Tag(name = "products-admin", description = "卖家商品管理")
@RestController
@RequestMapping("/seller/products")
@Validated
@RequiredArgsConstructor
@RequirePermission(Permissions.PRODUCT_MANAGE)
public class ProductAdminController {
    private final ProductService productService;
    private final SkuService skuService;
    private final ProductQueryService productQueryService;
    private final StockReadQuery stockReadQuery;
    private final QiniuClient qiniuClient;

    /** 商品图上传凭证：前端拿 ticket 后直传七牛，传完把 key 写进商品的 mainImage / images / detailImages；出参即 infra 值对象 UploadTicket */
    @PostMapping("/image-ticket")
    public UploadTicket issueImageTicket(@RequestParam String ext) {
        return qiniuClient.issueTicket("product", ext);
    }

    /** 创建商品草稿，返回含 id/createdAt 的出参。shopId 从店铺上下文（X-Shop-Id）取，不由前端传入 */
    @PostMapping
    public ProductResponse createProduct(@CurrentShop UUID shopId, @Valid @RequestBody CreateProductRequest request) {
        return ProductResponse.from(productService.create(request.toCommand(shopId)));
    }

    /** 提交规格选择并按 valueId 组合（spec_key）对账 SKU，返回当前全部 SKU（含新 id，供 updateSku 定位） */
    @PutMapping("/{id}/specs")
    public List<SkuResponse> updateProductSpecs(
            @CurrentShop UUID shopId, @PathVariable UUID id, @Valid @RequestBody UpdateSpecsRequest request) {
        List<Sku> skus = skuService.updateSpecs(shopId, id, request.toSelections());
        return skuResponses(skus);
    }

    /** 批量更新 SKU 价格/库存，返回更新后的 SKU 列表 */
    @PutMapping("/{id}/skus")
    public List<SkuResponse> updateProductSkus(
            @CurrentShop UUID shopId, @PathVariable UUID id, @Valid @RequestBody UpdateSkusRequest request) {
        List<Sku> skus = skuService.updateSkus(shopId, id, request.items());
        return skuResponses(skus);
    }

    /** 发布草稿：可立即上架（默认）或放入仓库（放入仓库=落 WAREHOUSE，不在售）。返回回填过价格区间的商品 */
    @PostMapping("/{id}/publish")
    public ProductResponse publishProduct(
            @CurrentShop UUID shopId,
            @PathVariable UUID id,
            @RequestParam(defaultValue = "PUBLISHED") ProductStatus target) {
        return ProductResponse.from(productService.publish(shopId, id, target));
    }

    /**
     * 商家后台商品列表：按当前店铺（X-Shop-Id）分页，可按状态/名称筛选，每行带库存与累计销量。
     * 库存=该商品全部 SKU 可用量之和；销量=已完成订单成交量之和（products.sold_count 投影列，订单完成时经 product.api :: ProductCommand 累加）。
     */
    @GetMapping
    public PageResult<ProductResponse> listShopProducts(
            @CurrentShop UUID shopId,
            @Valid PageParams pageParams,
            @RequestParam(required = false) ProductStatus status,
            @RequestParam(required = false) @Size(max = ProductFieldRules.KEYWORD_MAX) String keyword,
            @Pattern(
                            regexp = "createdAt_desc|createdAt_asc|stock_asc|stock_desc|soldCount_asc|soldCount_desc",
                            message = "排序方式不支持")
                    @RequestParam(required = false)
                    String sort) {
        return productQueryService
                .pageListWithMetrics(shopId, status, keyword, pageParams.page(), pageParams.size(), sort)
                .map(ProductResponse::from);
    }

    /** 商品详情：SPU 全字段 + 全部 SKU，任何状态可查 */
    @GetMapping("/{id}")
    public ProductDetailResponse getShopProductDetail(@CurrentShop UUID shopId, @PathVariable UUID id) {
        ProductDetail d = productQueryService.detail(shopId, id);
        return ProductDetailResponse.from(d, stocks(d.skus()));
    }

    /** 编辑基本信息（specs/SKU 之外的字段）；改规格走 PUT /{id}/specs */
    @PutMapping("/{id}")
    public ProductResponse updateProduct(
            @CurrentShop UUID shopId, @PathVariable UUID id, @Valid @RequestBody UpdateProductRequest request) {
        return ProductResponse.from(productService.updateBasic(shopId, id, request.toCommand()));
    }

    /** 下架：仅上架商品可下架。不做物理删除，下架即"删除"语义 */
    @PostMapping("/{id}/off")
    public ProductResponse offProduct(@CurrentShop UUID shopId, @PathVariable UUID id) {
        return ProductResponse.from(productService.off(shopId, id));
    }

    /** 重新上架：仅下架商品可上架，复检发布门槛（全部 SKU 已设价） */
    @PostMapping("/{id}/on")
    public ProductResponse onProduct(@CurrentShop UUID shopId, @PathVariable UUID id) {
        return ProductResponse.from(productService.on(shopId, id));
    }

    /** 放弃草稿：仅草稿可删（同事务清 SKU+库存），供草稿箱「扔掉这个草稿」。无 body，成功即 204。 */
    @DeleteMapping("/{id}")
    public void abandonProduct(@CurrentShop UUID shopId, @PathVariable UUID id) {
        productService.abandon(shopId, id);
    }

    // HTTP 出参（与买家侧 ProductController 的同名 record 互不共享：方向不同契约不同）
    private List<SkuResponse> skuResponses(List<Sku> skus) {
        Map<UUID, StockView> stocks = stocks(skus);
        return skus.stream()
                .map(s -> SkuResponse.from(s, stocks.get(s.getId())))
                .toList();
    }

    /** 跨模块批查库存：skuId → StockView，供 SkuResponse 补库存展示（卖家端） */
    private Map<UUID, StockView> stocks(List<Sku> skus) {
        return stockReadQuery.availableBySkuIds(skus.stream().map(Sku::getId).toList());
    }
}
