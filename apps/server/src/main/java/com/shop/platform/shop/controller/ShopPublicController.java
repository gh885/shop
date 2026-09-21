package com.shop.platform.shop.controller;

import com.shop.platform.shop.controller.response.PublicShopResponse;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.service.ShopService;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家侧店铺信息（匿名可访问）。
 *
 * <p>与 ShopController（/shops，需登录、卖家自己管自己的店）分开：这里只读、只返对外可展示的字段。 存在的理由是让 product
 * 模块不必去碰店铺数据——商详页要显示店名，前端拿 shopId 单独调这里。
 */
@Tag(name = "public-shops", description = "买家侧店铺信息（匿名可访问）")
@RestController
@RequestMapping("/api/shops")
@RequiredArgsConstructor
public class ShopPublicController {

    private final ShopService shopService;

    /** 店铺公开信息，仅 ACTIVE 店铺可见 */
    @GetMapping("/{id}")
    public PublicShopResponse getPublicShop(@PathVariable UUID id) {
        Shop shop = shopService.publicShop(id);
        return new PublicShopResponse(shop.getId(), shop.getName(), shop.getLogoKey(), shop.getCreatedAt());
    }
}
