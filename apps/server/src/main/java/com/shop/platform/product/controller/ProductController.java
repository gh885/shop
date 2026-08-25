package com.shop.platform.product.controller;

import com.shop.platform.common.Money;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.inventory.api.StockReadQuery;
import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.dto.ProductQuery;
import com.shop.platform.product.mapper.ParamItem;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.mapper.SpecItem;
import com.shop.platform.product.service.ProductDetail;
import com.shop.platform.product.service.ProductService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家侧商品浏览（匿名可访问，见 JwtProperties.skipPaths）。
 *
 * <p>与 ProductAdminController 的分工：那边按 X-Shop-Id 操作自己店的全状态商品，这边只读全站上架商品。 出参一律走本类的 Response
 * 内部类，不直接返实体——实体带 status/updatedAt/skuCode 等买家不该看的字段。
 *
 * <p>店铺名不在这里拼：product 模块不碰 shop 的数据，前端拿 shopId 另调 GET /api/shops/{id}（SSR 里两个请求可并发）。
 */
@RestController
@RequestMapping("/api/products")
@Validated
@RequiredArgsConstructor
public class ProductController {

    private final ProductService productService;

    private final StockReadQuery stockReadQuery;

    /** 商品列表：只返上架商品，可按类目/店铺/关键词筛选并排序 */
    @GetMapping
    public PageResult<ProductResponse> list(@Valid PageParams pageParams, @Valid ProductQuery query) {
        PageResult<Product> page = productService.pagePublic(query, pageParams.page(), pageParams.size());
        return new PageResult<>(
                page.records().stream().map(ProductResponse::from).toList(), page.total());
    }

    /** 商品详情：非上架一律 404，SKU 只返在售 */
    @GetMapping("/{id}")
    public ProductDetailResponse detail(@PathVariable UUID id) {
        ProductDetail d = productService.publicDetail(id);
        return ProductDetailResponse.from(d, stocks(d.skus()));
    }

    /** 列表项：够渲染一张商品卡片即可，详情独有的大字段（description/images）不进列表，省带宽 */
    public record ProductResponse(
            UUID id,
            UUID shopId,
            UUID categoryId,
            String name,
            String subtitle,
            String mainImage,
            Money minPrice,
            Money maxPrice) {

        static ProductResponse from(Product p) {
            return new ProductResponse(
                    p.getId(),
                    p.getShopId(),
                    p.getCategoryId(),
                    p.getName(),
                    p.getSubtitle(),
                    p.getMainImage(),
                    p.getMinPrice() == null ? null : Money.cny(p.getMinPrice()),
                    p.getMaxPrice() == null ? null : Money.cny(p.getMaxPrice()));
        }
    }

    /** 详情：嵌套列表项 + 详情独有字段，字段不重复铺一遍（与 service 的 ProductDetail 同构） */
    public record ProductDetailResponse(
            ProductResponse product,
            String description,
            List<String> images,
            List<SpecItem> specs,
            List<ParamItem> params,
            List<SkuResponse> skus) {

        static ProductDetailResponse from(ProductDetail d, Map<UUID, StockView> stocks) {
            Product p = d.product();
            return new ProductDetailResponse(
                    ProductResponse.from(p),
                    p.getDescription(),
                    p.getImages(),
                    p.getSpecs(),
                    p.getParams(),
                    d.skus().stream()
                            .map(s -> SkuResponse.from(s, stocks.get(s.getId())))
                            .toList());
        }
    }

    /** SKU：买家选规格/下单要用的字段。不返 skuCode（仓管内部编码）与 status（service 已过滤，恒为在售） */
    public record SkuResponse(
            UUID id,
            String name,
            List<ParamItem> attributes,
            String image,
            Money price,
            Money originalPrice,
            Integer stock) {

        /** 币种取 Sku.currency，缺省回退本平台默认币种 CNY；null 金额不构造成 Money */
        private static Money money(Long fen, String currency) {
            if (fen == null) return null;
            return Money.ofFen(fen, currency != null ? currency : Money.CNY);
        }

        static SkuResponse from(Sku s, StockView stock) {
            return new SkuResponse(
                    s.getId(),
                    s.getName(),
                    s.getAttributes(),
                    s.getImage(),
                    money(s.getPrice(), s.getCurrency()),
                    money(s.getOriginalPrice(), s.getCurrency()),
                    stock == null ? 0 : stock.availableStock());
        }
    }

    /** 跨模块批查库存：skuId → StockView，供 SkuResponse 补库存展示（买家端详情） */
    private Map<UUID, StockView> stocks(List<Sku> skus) {
        return stockReadQuery.availableBySkuIds(skus.stream().map(Sku::getId).toList());
    }
}
