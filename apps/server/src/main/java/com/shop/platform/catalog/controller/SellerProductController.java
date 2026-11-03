package com.shop.platform.catalog.controller;

import com.shop.platform.catalog.dto.CreateProductRequest;
import com.shop.platform.catalog.dto.CreateProductResponse;
import com.shop.platform.catalog.dto.ListingResult;
import com.shop.platform.catalog.dto.SubmitListingRequest;
import com.shop.platform.catalog.service.CatalogPublishService;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 卖家侧商品入口：建草稿、提交挂售。 */
@RestController
@RequestMapping("/api/seller/products")
public class SellerProductController {

    private final CatalogPublishService catalog;
    private final Authorizer authorizer;

    public SellerProductController(CatalogPublishService catalog, Authorizer authorizer) {
        this.catalog = catalog;
        this.authorizer = authorizer;
    }

    @PostMapping
    public CreateProductResponse createProduct(@Valid @RequestBody CreateProductRequest request) {
        authorizer.seller(Permission.PRODUCT_WRITE);
        return new CreateProductResponse(catalog.createDraft(request, authorizer.current()));
    }

    @PostMapping("/{spuId}/listings")
    public ListingResult submitListing(@PathVariable UUID spuId, @Valid @RequestBody SubmitListingRequest request) {
        authorizer.seller(Permission.PRODUCT_WRITE);
        authorizer.checkShop(request.shopId());
        return catalog.submitListing(spuId, request.shopId(), authorizer.current());
    }
}
