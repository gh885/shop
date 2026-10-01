package com.shop.platform.product.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.product.dto.ProductQuery;
import com.shop.platform.product.service.ProductQueryService;
import com.shop.platform.product.service.PublicProductDetailView;
import com.shop.platform.product.service.PublicProductView;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
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
 * <p>与 ProductAdminController 的分工：那边按 X-Shop-Id 操作自己店的全状态商品，这边只读全站上架商品。
 * 出参是 {@code product.service} 包的契约形状（{@link PublicProductView} / {@link PublicProductDetailView}，
 * 用 {@code @Schema(name = ...)} 钉成 PublicProductResponse / PublicProductDetailResponse）——带 {@code @Schema}
 * 的形状即 wire 契约，本类不再套一层同形的 Response（那是第二份契约载体）。也不直接返实体：实体带
 * status/updatedAt/skuCode 等买家不该看的字段，取哪几列、怎么补库存都收在 {@link ProductQueryService}。
 *
 * <p>店名不在这里拼：本模块的 Modulith 登记只有 {@code inventory :: api} 与 {@code shop :: events}（见
 * package-info），拿不到店铺数据；前端拿 shopId 另调 GET /api/shops/{id}（SSR 里两个请求可并发）。
 * 这是接口与页面组合策略，不是「product 不许碰 shop」的架构禁令——真要在卡片上带店名，登记
 * {@code shop :: api} 后经 ShopReadQuery 批查即可。
 */
@Tag(name = "products", description = "买家侧商品浏览（匿名可访问）")
@RestController
@RequestMapping("/api/products")
@Validated
@RequiredArgsConstructor
public class ProductController {

    private final ProductQueryService productQueryService;

    /** 商品列表：只返上架商品，可按类目/店铺/关键词筛选并排序 */
    @GetMapping
    public PageResult<PublicProductView> listPublicProducts(@Valid PageParams pageParams, @Valid ProductQuery query) {
        return productQueryService.pagePublicView(query, pageParams.page(), pageParams.size());
    }

    /** 商品详情：非上架一律 404，SKU 只返在售（库存由查询服务补齐） */
    @GetMapping("/{id}")
    public PublicProductDetailView getPublicProductDetail(@PathVariable UUID id) {
        return productQueryService.publicDetailView(id);
    }
}
