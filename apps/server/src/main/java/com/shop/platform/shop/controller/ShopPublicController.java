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
 * <p>与 ShopController（/shops，需登录、卖家自己管自己的店）分开：这里只读、只返对外可展示的字段。
 *
 * <p>商详页要显示店名，而 product 的详情接口只下发 shopId、不在服务端把店名拼进来——这不是模块禁令
 * （跨模块按 ID 读店铺数据有 shop :: api 的 {@code ShopReadQuery}，order 的列表/详情就是靠它补店名的），
 * 而是<b>页面组合策略</b>：店名/logo 谁都要（商详、店铺页、以后的收藏与足迹），做成一个能独立缓存的只读入口
 * （{@code shop:public}，见 ACC-05）好过在每个聚合接口里各拼一份店铺投影——聚合会跟着消费者数量长，
 * 而这一份读的形状（只有 ACTIVE 可见、只给对外字段）从头到尾只有一处。
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
