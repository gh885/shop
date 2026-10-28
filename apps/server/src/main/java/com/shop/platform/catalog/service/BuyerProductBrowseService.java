package com.shop.platform.catalog.service;

import com.shop.platform.catalog.dto.BuyerProductCard;
import com.shop.platform.catalog.dto.BuyerProductPage;
import com.shop.platform.catalog.dto.CategoryTreeNode;
import com.shop.platform.catalog.mapper.BuyerProductListMapper;
import com.shop.platform.catalog.mapper.BuyerProductListMapper.Row;
import com.shop.platform.catalog.mapper.CategoryMapper;
import com.shop.platform.catalog.mapper.CategoryRow;
import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.web.CursorCodec;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 买家商品浏览：首页 feed、类目页、搜索页共用这一条读路径。
 *
 * <p><b>这是「搜索模块未开工」时的降级路径。</b> 按模块地图 §5.2，{@code search} 是可以随时清空
 * 重建的读侧投影，"挂了降级到类目浏览"是明写的前提。本类就是那个降级目标：直接读
 * {@code catalog}（分类/标题/价格），不做全文索引、不做相关度排序——够把商品摆出来让人点。
 * 等 {@code search} 落地，这条路径保留为"索引不可用时的兜底"，不会白写。
 *
 * <h2>三条决定</h2>
 *
 * <ul>
 *   <li><b>只出可售</b>：{@code EXISTS online listing}。与详情页同一判据，见 {@code product-model.md}
 *   <li><b>类目筛选按整支展开</b>：点一个分组类目，应列出其下所有叶子类目的商品。展开在服务端做
 *       （一次查树的全部节点，内存里按 path 前缀找子孙），不让前端逐层拼 categoryId 列表
 *   <li><b>游标用于 newest；价格排序退回 offset</b>：价格排序的游标要带"价格+id"两段，
 *       与全局 {@code (created_at,id)} 口径不同。为了不引入第二种游标格式，价格排序这一版
 *       用 limit 截断（首页场景足够），真要深翻页再补价格游标——那时是一处明确的增量，不是现在猜
 * </ul>
 */
@Component
public class BuyerProductBrowseService {

    /** 与前端 PRODUCT_SORT_VALUES 对齐；词表外的值直接 400，不放进去变成永远空页。 */
    private static final Set<String> SORTS = Set.of("newest", "price_asc", "price_desc");

    private static final int DEFAULT_PAGE_SIZE = 24;

    private static final int MAX_PAGE_SIZE = 100;

    private final BuyerProductListMapper products;
    private final CategoryMapper categories;

    public BuyerProductBrowseService(BuyerProductListMapper products, CategoryMapper categories) {
        this.products = Objects.requireNonNull(products, "products");
        this.categories = Objects.requireNonNull(categories, "categories");
    }

    /**
     * 一页商品。
     *
     * @param categoryId 类目筛选，null = 全部。可以传分组类目——service 会展开成其下全部叶子
     * @param keyword 标题模糊匹配
     * @param sort 排序词表里的值；非法 400
     * @param cursor 上一页 nextCursor；仅 newest 用它
     * @param limit 服务端 clamp 到 1–100
     */
    @Transactional(readOnly = true)
    public BuyerProductPage page(UUID categoryId, String keyword, String sort, String cursor, int limit) {
        String effectiveSort = sort == null || sort.isBlank() ? "newest" : sort;
        if (!SORTS.contains(effectiveSort)) {
            throw BusinessException.badRequest("sort 只认 newest / price_asc / price_desc: " + sort);
        }
        int pageSize = Math.clamp(limit <= 0 ? DEFAULT_PAGE_SIZE : limit, 1, MAX_PAGE_SIZE);

        List<UUID> categoryIds = categoryId == null ? null : expandToLeaves(categoryId);
        // 分组类目下没有任何叶子 → 不可能有商品，直接空页，不打库
        if (categoryIds != null && categoryIds.isEmpty()) {
            return new BuyerProductPage(List.of(), null);
        }

        CursorCodec.Point point = cursor == null || cursor.isBlank() ? null : CursorCodec.decode(cursor);
        // 价格排序不支持游标（见类注释），只翻第一页
        boolean cursorable = "newest".equals(effectiveSort);

        // 多取一条判有无下一页，省一次 count
        List<Row> rows = products.page(
                categoryIds,
                keyword == null || keyword.isBlank() ? null : keyword.trim(),
                effectiveSort,
                cursorable && point != null ? point.createdAt() : null,
                cursorable && point != null ? point.id() : null,
                pageSize + 1);

        boolean hasMore = rows.size() > pageSize;
        List<Row> pageRows = hasMore ? rows.subList(0, pageSize) : rows;

        List<BuyerProductCard> items = pageRows.stream().map(Row::toCard).toList();
        String nextCursor = cursorable && hasMore
                ? CursorCodec.encode(
                        pageRows.getLast().createdAt(), pageRows.getLast().spuId())
                : null;
        return new BuyerProductPage(items, nextCursor);
    }

    /**
     * 把一个类目展开成它自身（若是叶子）或全部叶子子孙的 id 列表。
     *
     * <p>查整棵树一次、在内存里按 id 钻取子树——比"递归查库拼子孙 id"省事且结果自洽
     * （同一次快照）。类目就几千个节点，这点内存遍历可以忽略。
     */
    private List<UUID> expandToLeaves(UUID categoryId) {
        CategoryRow root =
                categories.find(categoryId).orElseThrow(() -> BusinessException.notFound("类目不存在: " + categoryId));
        if (root.leaf()) {
            return List.of(categoryId);
        }
        return leavesUnder(categories.tree(), categoryId).stream()
                .map(CategoryTreeNode::id)
                .toList();
    }

    /** 在整棵树里找到目标节点，收集其下所有叶子。找不到返回空。 */
    private List<CategoryTreeNode> leavesUnder(List<CategoryTreeNode> nodes, UUID targetId) {
        for (CategoryTreeNode node : nodes) {
            if (node.id().equals(targetId)) {
                return collectLeaves(node);
            }
            List<CategoryTreeNode> deeper = leavesUnder(node.children(), targetId);
            if (!deeper.isEmpty()) {
                return deeper;
            }
        }
        return List.of();
    }

    private List<CategoryTreeNode> collectLeaves(CategoryTreeNode node) {
        if (node.leaf()) {
            return List.of(node);
        }
        List<CategoryTreeNode> leaves = new ArrayList<>();
        for (CategoryTreeNode child : node.children()) {
            leaves.addAll(collectLeaves(child));
        }
        return leaves;
    }
}
