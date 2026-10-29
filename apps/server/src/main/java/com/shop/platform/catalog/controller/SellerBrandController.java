package com.shop.platform.catalog.controller;

import com.shop.platform.catalog.mapper.BrandMapper;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家侧品牌只读入口：发品时选品牌。
 *
 * <p>在它之前品牌列表只有 {@code /api/admin/brands}（要 {@code CATEGORY_MANAGE}），
 * 卖家拿不到任何 brandId；而品牌策略为 {@code required} 的类目又必须传 brandId——
 * 发布链路对卖家不可达。与「卖家商品列表」「卖家类目树」是同一类缺口：接口都在，入口没有。
 *
 * <p>只返回 {@code approved}：未审核品牌不该出现在商家的下拉里，选了也会被发布闸门拒。
 */
@RestController
@RequestMapping("/api/seller/brands")
public class SellerBrandController {

    private final BrandMapper brands;
    private final Authorizer authorizer;

    public SellerBrandController(BrandMapper brands, Authorizer authorizer) {
        this.brands = brands;
        this.authorizer = authorizer;
    }

    @GetMapping
    public List<BrandMapper.BrandRow> listApproved(@RequestParam(required = false) String keyword) {
        authorizer.check(Permission.PRODUCT_READ);
        return brands.listApproved(keyword);
    }
}
