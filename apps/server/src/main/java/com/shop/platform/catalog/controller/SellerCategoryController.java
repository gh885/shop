package com.shop.platform.catalog.controller;

import com.shop.platform.catalog.dto.CategoryTreeNode;
import com.shop.platform.catalog.model.CategoryConfig;
import com.shop.platform.catalog.service.CatalogConfigService;
import com.shop.platform.catalog.service.CategoryBrowseService;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家侧类目只读入口：发品选类目、渲染属性模板表单用。
 *
 * <p><b>它补的是一个断掉的入口。</b> 在它之前，卖家建商品必须传 {@code categoryId}，
 * 而唯一的类目树是 {@code GET /api/admin/categories/tree}（要 {@code CATEGORY_MANAGE}）——
 * 卖家拿不到那个权限，也就拿不到任何 categoryId，发布链路在前端不可达。这与
 * 「卖家商品列表」当初缺的东西是同一类：接口都在，入口没有。
 *
 * <p>读用 {@code PRODUCT_READ}：卖家看自己能不能在某个类目发品，本质是商品侧动作。
 * 不要求 {@code CATEGORY_MANAGE}——那是"改类目定义"的权限，卖家不该有。
 */
@RestController
@RequestMapping("/api/seller/categories")
public class SellerCategoryController {

    private final CategoryBrowseService browse;
    private final CatalogConfigService config;
    private final Authorizer authorizer;

    public SellerCategoryController(CategoryBrowseService browse, CatalogConfigService config, Authorizer authorizer) {
        this.browse = browse;
        this.config = config;
        this.authorizer = authorizer;
    }

    /** 卖家可见的类目树：active + frozen。frozen 的叶子 {@code mountable=false}，前端据此禁用。 */
    @GetMapping("/tree")
    public List<CategoryTreeNode> sellerTree() {
        authorizer.seller(Permission.PRODUCT_READ);
        return browse.sellerTree();
    }

    /**
     * 叶子类目的配置（属性模板、识别键、品牌策略等）。卖家靠它渲染发品表单的字段。
     *
     * <p>复用 {@link CatalogConfigService#config}：配置是类目的定义，没有"平台版/卖家版"两种口径，
     * 复制一份只会漂。分组类目没有配置，返回 404。
     */
    @GetMapping("/{categoryId}/config")
    public CategoryConfig sellerCategoryConfig(@PathVariable UUID categoryId) {
        authorizer.seller(Permission.PRODUCT_READ);
        return config.config(categoryId);
    }
}
