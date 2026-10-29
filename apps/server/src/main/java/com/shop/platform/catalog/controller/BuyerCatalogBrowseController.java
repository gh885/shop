package com.shop.platform.catalog.controller;

import com.shop.platform.catalog.dto.BuyerProductPage;
import com.shop.platform.catalog.dto.CategoryTreeNode;
import com.shop.platform.catalog.service.BuyerProductBrowseService;
import com.shop.platform.catalog.service.CategoryBrowseService;
import com.shop.platform.common.PagingRules;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家侧浏览入口：首页 feed、类目页、搜索页共用。
 *
 * <p><b>这是"搜索模块未开工"时的降级路径。</b> 按模块地图 §5.2，{@code search} 是可随时清空重建的
 * 读侧投影，"挂了降级到类目浏览"是明写的前提。这里直接读 {@code catalog} 出图/标题/起价，
 * 不做全文索引与相关度排序——够把商品摆出来让人点。{@code search} 落地后本路径保留为索引不可用时的兜底。
 *
 * <p>无权限点：买家没有权限体系（{@code access-control.md} §1.2），边界是"这些数据公不公开"。
 * 商品与类目本来就是公开的（详情页 {@code GET /api/buyer/catalog/products/{spuId}} 也这么开），
 * 所以这里不需要 {@code authorizer.check}。登录与否不影响结果——公开浏览对未登录用户同样开放。
 */
@RestController
@RequestMapping("/api/buyer/catalog")
public class BuyerCatalogBrowseController {

    private final BuyerProductBrowseService browse;
    private final CategoryBrowseService categoryBrowse;

    public BuyerCatalogBrowseController(BuyerProductBrowseService browse, CategoryBrowseService categoryBrowse) {
        this.browse = browse;
        this.categoryBrowse = categoryBrowse;
    }

    /** 买家导航的类目树：只留 active 类目，剪掉空分组。首页分类导航与类目页左侧都用它。 */
    @GetMapping("/categories")
    public List<CategoryTreeNode> categories() {
        return categoryBrowse.buyerTree();
    }

    /**
     * 商品列表。首页 feed、搜索结果、类目页都吃这一条。
     *
     * @param categoryId 类目筛选，null = 全部。可传分组类目，服务端展开为其下全部叶子
     * @param q 标题关键词，null = 不过滤
     * @param sort newest / price_asc / price_desc；缺省 newest
     * @param cursor 上一页 nextCursor（仅 newest 支持深翻页）
     * @param limit 服务端 clamp 到 1–100，缺省 24
     */
    @GetMapping("/products")
    public BuyerProductPage products(
            @RequestParam(required = false) UUID categoryId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String cursor,
            @Min(1) @Max(PagingRules.MAX_LIMIT) @RequestParam(defaultValue = "24") int limit) {
        return browse.page(categoryId, q, sort, cursor, limit);
    }
}
