package com.shop.platform.catalog.controller;

import com.shop.platform.catalog.dto.ProductDetail;
import com.shop.platform.catalog.service.CatalogPublishService;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 买家侧只读入口。商品详情只暴露 online offer 覆盖的 SKU。 */
@RestController
@RequestMapping("/api/catalog")
public class CatalogQueryController {

    private final CatalogPublishService catalog;

    public CatalogQueryController(CatalogPublishService catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/products/{spuId}")
    public ProductDetail product(@PathVariable UUID spuId) {
        return catalog.product(spuId);
    }
}
