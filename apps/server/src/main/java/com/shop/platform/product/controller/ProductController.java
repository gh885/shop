package com.shop.platform.product.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.inventory.api.StockReadQuery;
import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.dto.ProductQuery;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.service.ProductDetail;
import com.shop.platform.product.service.ProductQueryService;
import com.shop.platform.product.service.PublicProductDetailView;
import com.shop.platform.product.service.PublicProductView;
import io.swagger.v3.oas.annotations.tags.Tag;
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
 * 买家侧商品浏览（匿名可访问）。
 *
 * <p>与 ProductAdminController 的分工：那边按 X-Shop-Id 操作自己店的全状态商品，这边只读全站上架商品。 出参一律走本类的 Response
 * 内部类，不直接返实体——实体带 status/updatedAt/skuCode 等买家不该看的字段。
 *
 * <p>店铺名不在这里拼：product 模块不碰 shop 的数据，前端拿 shopId 另调 GET /api/shops/{id}（SSR 里两个请求可并发）。
 */
@Tag(name = "products", description = "买家侧商品浏览（匿名可访问）")
@RestController
@RequestMapping("/api/products")
@Validated
@RequiredArgsConstructor
public class ProductController {

    private final ProductQueryService productQueryService;

    private final StockReadQuery stockReadQuery;

    /** 商品列表：只返上架商品，可按类目/店铺/关键词筛选并排序 */
    @GetMapping
    public PageResult<PublicProductView> listPublicProducts(@Valid PageParams pageParams, @Valid ProductQuery query) {
        return productQueryService
                .pagePublic(query, pageParams.page(), pageParams.size())
                .map(PublicProductView::from);
    }

    /** 商品详情：非上架一律 404，SKU 只返在售 */
    @GetMapping("/{id}")
    public PublicProductDetailView getPublicProductDetail(@PathVariable UUID id) {
        ProductDetail d = productQueryService.publicDetail(id);
        return PublicProductDetailView.from(d, stocks(d.skus()));
    }

    /** 跨模块批查库存：skuId → StockView，供 PublicSkuView 补库存展示（买家端详情） */
    private Map<UUID, StockView> stocks(List<Sku> skus) {
        return stockReadQuery.availableBySkuIds(skus.stream().map(Sku::getId).toList());
    }
}
