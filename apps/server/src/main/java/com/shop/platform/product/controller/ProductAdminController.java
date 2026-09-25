package com.shop.platform.product.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Permissions;
import com.shop.platform.infra.qiniu.QiniuClient;
import com.shop.platform.infra.qiniu.UploadTicket;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentShop;
import com.shop.platform.product.dto.CreateProductRequest;
import com.shop.platform.product.dto.ProductAdminSort;
import com.shop.platform.product.dto.ProductFieldRules;
import com.shop.platform.product.dto.UpdateProductRequest;
import com.shop.platform.product.dto.UpdateSkusRequest;
import com.shop.platform.product.dto.UpdateSpecsRequest;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.product.service.ProductDetailView;
import com.shop.platform.product.service.ProductQueryService;
import com.shop.platform.product.service.ProductService;
import com.shop.platform.product.service.ProductService.CreateProductCommand;
import com.shop.platform.product.service.ProductService.UpdateBasicCommand;
import com.shop.platform.product.service.ProductView;
import com.shop.platform.product.service.SkuService;
import com.shop.platform.product.service.SkuService.SpecSelection;
import com.shop.platform.product.service.SkuView;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家商品管理（授权要求 PRODUCT_MANAGE，读随写权）。
 *
 * <p>业务出参是 {@code product.service} 包的契约形状（{@link ProductView} / {@link ProductDetailView} /
 * {@link SkuView}，用 {@code @Schema(name = ...)} 钉成 ProductResponse / ProductDetailResponse / SkuResponse）：
 * 带 {@code @Schema} 的形状即 wire 契约，字段只减不增（卖家端 zod schema 逐字段严格校验），本类不再套一层同形的
 * Response。上传凭证直出 infra 值对象 {@link UploadTicket}。
 *
 * <p>SPU→SKU 的投影与库存补齐（含向 inventory 批查可用量）一律在 {@link ProductQueryService}：本类只做路由、
 * 店铺上下文注入和入参形状门。
 */
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
    private final QiniuClient qiniuClient;

    /** 商品图上传凭证：前端拿 ticket 后直传七牛，传完把 key 写进商品的 mainImage / images / detailImages；出参即 infra 值对象 UploadTicket */
    @PostMapping("/image-ticket")
    public UploadTicket issueImageTicket(@RequestParam String ext) {
        return qiniuClient.issueTicket("product", ext);
    }

    /** 创建商品草稿，返回含 id/createdAt 的出参（新建资源 → 201）。shopId 从店铺上下文（X-Shop-Id）取，不由前端传入 */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProductView createProduct(@CurrentShop UUID shopId, @Valid @RequestBody CreateProductRequest request) {
        return productQueryService.sellerView(productService.create(new CreateProductCommand(
                shopId,
                request.categoryId(),
                request.name(),
                request.subtitle(),
                request.detailImages(),
                request.mainImage(),
                request.images(),
                request.params(),
                request.sevenDayReturn())));
    }

    /** 提交规格选择并按 valueId 组合（spec_key）对账 SKU，返回当前全部 SKU（含新 id，供 updateSku 定位） */
    @PutMapping("/{id}/specs")
    public List<SkuView> updateProductSpecs(
            @CurrentShop UUID shopId, @PathVariable UUID id, @Valid @RequestBody UpdateSpecsRequest request) {
        List<Sku> skus = skuService.updateSpecs(
                shopId,
                id,
                request.specs().stream()
                        .map(spec -> new SpecSelection(
                                spec.attrId(),
                                spec.valueIds(),
                                spec.customValues(),
                                spec.valueImages(),
                                spec.customValueImages()))
                        .toList());
        return productQueryService.skuViews(skus);
    }

    /** 批量更新 SKU 价格/库存，返回更新后的 SKU 列表 */
    @PutMapping("/{id}/skus")
    public List<SkuView> updateProductSkus(
            @CurrentShop UUID shopId, @PathVariable UUID id, @Valid @RequestBody UpdateSkusRequest request) {
        return productQueryService.skuViews(skuService.updateSkus(shopId, id, request.items()));
    }

    /** 发布草稿：可立即上架（默认）或放入仓库（放入仓库=落 WAREHOUSE，不在售）。返回回填过价格区间与真实库存的商品 */
    @PostMapping("/{id}/publish")
    public ProductView publishProduct(
            @CurrentShop UUID shopId,
            @PathVariable UUID id,
            @RequestParam(defaultValue = "PUBLISHED") ProductStatus target) {
        return productQueryService.sellerView(productService.publish(shopId, id, target));
    }

    /**
     * 商家后台商品列表：按当前店铺（X-Shop-Id）分页，可按状态/名称筛选，每行带库存与累计销量。
     * 库存=该商品全部 SKU 可用量之和；销量=已完成订单成交量之和（products.sold_count 投影列，订单完成时经 product.api :: ProductCommand 累加）。
     */
    @GetMapping
    public PageResult<ProductView> listShopProducts(
            @CurrentShop UUID shopId,
            @Valid PageParams pageParams,
            @RequestParam(required = false) ProductStatus status,
            @RequestParam(required = false) @Size(max = ProductFieldRules.KEYWORD_MAX) String keyword,
            @Pattern(regexp = ProductAdminSort.PATTERN, message = "排序方式不支持") @RequestParam(required = false)
                    String sort) {
        return productQueryService
                .pageListWithMetrics(shopId, status, keyword, pageParams.page(), pageParams.size(), sort)
                .map(ProductView::from);
    }

    /** 商品详情：SPU 全字段 + 全部 SKU，任何状态可查（两处库存由查询服务补齐） */
    @GetMapping("/{id}")
    public ProductDetailView getShopProductDetail(@CurrentShop UUID shopId, @PathVariable UUID id) {
        return productQueryService.sellerDetailView(shopId, id);
    }

    /** 编辑基本信息（specs/SKU 之外的字段）；改规格走 PUT /{id}/specs */
    @PutMapping("/{id}")
    public ProductView updateProduct(
            @CurrentShop UUID shopId, @PathVariable UUID id, @Valid @RequestBody UpdateProductRequest request) {
        return productQueryService.sellerView(productService.updateBasic(
                shopId,
                id,
                new UpdateBasicCommand(
                        request.categoryId(),
                        request.name(),
                        request.subtitle(),
                        request.detailImages(),
                        request.mainImage(),
                        request.images(),
                        request.params(),
                        request.sevenDayReturn())));
    }

    /** 下架：仅上架商品可下架。不做物理删除，下架即"删除"语义 */
    @PostMapping("/{id}/off")
    public ProductView offProduct(@CurrentShop UUID shopId, @PathVariable UUID id) {
        return productQueryService.sellerView(productService.off(shopId, id));
    }

    /** 重新上架：仅下架商品可上架，复检发布门槛（全部 SKU 已设价） */
    @PostMapping("/{id}/on")
    public ProductView onProduct(@CurrentShop UUID shopId, @PathVariable UUID id) {
        return productQueryService.sellerView(productService.on(shopId, id));
    }

    /** 放弃草稿：仅草稿可删（同事务清 SKU+库存），供草稿箱「扔掉这个草稿」。无 body，成功即 204（void handler + @ResponseStatus，与地址/收藏/运费模板的删除同一口径） */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void abandonProduct(@CurrentShop UUID shopId, @PathVariable UUID id) {
        productService.abandon(shopId, id);
    }
}
