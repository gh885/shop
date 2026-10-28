package com.shop.platform.catalog.service;

import com.shop.platform.catalog.dto.CategoryTreeNode;
import com.shop.platform.catalog.mapper.CategoryMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * 类目树的只读视图：给买家导航和卖家发品选类目用。
 *
 * <p><b>为什么不是直接复用 {@code CatalogConfigService.tree()}。</b> 那个是平台配置视角，
 * 把 draft（没配齐）、closed（停卖）也照实给出来——运营要看见"这个类目还没配好"。
 * 而买家导航与卖家选类目只该看见<b>能用的</b>类目：买家点进一个停卖类目只会看到空列表，
 * 卖家选一个没配齐的类目发品会被 400 拒。所以这里按角色裁剪，不新增第二棵树。
 *
 * <p><b>裁剪不是权限。</b> 卖家最终能不能在某个类目卖，由 {@code governance.canSell} 在发布时判；
 * 这里只挡"这类目此刻根本不可用"，避免把必然失败的选项摆到人面前。真正的闸门仍在发布链路。
 */
@Component
public class CategoryBrowseService {

    /** 买家导航认的类目状态：只有 active。frozen 只让存量卖完、不再挂新，导航里出现只会引导进空页。 */
    private static final Set<String> BUYER_VISIBLE = Set.of("active");

    /** 卖家选类目认的类目状态：active（可挂）与 frozen（存量在卖，但挂不了新的）。 */
    private static final Set<String> SELLER_VISIBLE = Set.of("active", "frozen");

    private final CategoryMapper categories;

    public CategoryBrowseService(CategoryMapper categories) {
        this.categories = Objects.requireNonNull(categories, "categories");
    }

    /** 买家导航树：只留 active 类目，且剪掉没有任何可用叶子的分组。 */
    public List<CategoryTreeNode> buyerTree() {
        return prune(categories.tree(), BUYER_VISIBLE);
    }

    /** 卖家选类目树：active + frozen。frozen 的叶子 mountable=false，前端据此禁用。 */
    public List<CategoryTreeNode> sellerTree() {
        return prune(categories.tree(), SELLER_VISIBLE);
    }

    /**
     * 只留状态在白名单里的叶子；分组节点在保留子树非空时保留。
     *
     * <p>一条规则解决两件事：叶子本身状态不对就删；分组下所有叶子都被删空，分组也删
     * （一个点进去什么都没有的分组比不显示更糟）。
     */
    private List<CategoryTreeNode> prune(List<CategoryTreeNode> nodes, Set<String> visible) {
        List<CategoryTreeNode> kept = new ArrayList<>();
        for (CategoryTreeNode node : nodes) {
            List<CategoryTreeNode> children = prune(node.children(), visible);
            boolean usableLeaf = node.leaf() && visible.contains(node.status());
            if (usableLeaf || !children.isEmpty()) {
                kept.add(new CategoryTreeNode(
                        node.id(),
                        node.parentId(),
                        node.code(),
                        node.name(),
                        node.level(),
                        node.sort(),
                        node.status(),
                        node.leaf(),
                        node.mountable(),
                        children));
            }
        }
        return kept;
    }

    /** 叶子类目的属性模板等配置，卖家发品要照它渲染表单。分组类目没有配置，抛 404。 */
    public UUID requireLeafForSeller(UUID categoryId) {
        return categories
                .find(categoryId)
                .filter(row -> row.leaf())
                .map(row -> categoryId)
                .orElseThrow(
                        () -> com.shop.platform.common.BusinessException.notFound("该类目不能挂商品（不存在或不是叶子）: " + categoryId));
    }
}
