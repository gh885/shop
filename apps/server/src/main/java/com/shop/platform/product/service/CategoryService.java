package com.shop.platform.product.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.cache.CacheNames;
import com.shop.platform.infra.db.DuplicateKeys;
import com.shop.platform.product.mapper.Category;
import com.shop.platform.product.mapper.CategoryMapper;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.ProductMapper;
import com.shop.platform.product.model.CategoryStatus;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 类目读写。前台两份读（类目树、子树 id 集）走 Redis 读缓存，三个后台写各挂一道失效。
 *
 * <p>失效一律 allEntries：缓存里既有「整棵树」一份，又有「每个类目 id 一份」子树集，改任一行都会波及不确定的
 * 多个键（禁一个父级，它整支的子树键全变），而写侧是运营手点——整组清比算该清哪几个键便宜得多。
 */
@Service
@RequiredArgsConstructor
public class CategoryService {

    private static final int MAX_LEVEL = 3;

    private final CategoryMapper categoryMapper;

    private final ProductMapper productMapper;

    /**
     * 前台类目树：仅启用节点，禁用节点整支剪掉。进 Redis 读缓存（首页/分类页每次都读，改动是运营偶尔为之），
     * 失效挂在下面的三个后台写上。管理端看的 {@link #adminTree()} 不缓存——运营要立刻看到自己刚改的东西。
     */
    @Cacheable(cacheNames = CacheNames.CATEGORY_TREE, key = "'tree'")
    public List<CategoryNode> publicTree() {
        return buildTree(false);
    }

    /** 管理端类目树：全量，含禁用节点 */
    public List<CategoryNode> adminTree() {
        return buildTree(true);
    }

    /**
     * 可见子树 id 集：自身 + 全部后代，禁用节点整支剪掉（与 {@link #publicTree()} 同一裁剪口径——
     * 父链上有一个不可见，后代就不可达）。
     *
     * <p>给召回用：feed 的 tab 可能指向一级类目，而商品挂在三级类目，所以要按子树召回而不是精确匹配。
     * 类目表不到百行，展开本身不值钱，值钱的是那次全表读——feed 每刷一次就是一次，所以按类目 id 缓存展开结果
     * （{@link CacheNames#CATEGORY_SUBTREE}），类目一改整组清。未知 / 隐藏类目返回空集——召回侧按空流处理，
     * 不 404（脏 tab 不该把首页打成错误页）；空集同样入缓存，否则脏 tab 每次都白打一次库。
     */
    @Cacheable(cacheNames = CacheNames.CATEGORY_SUBTREE, key = "#categoryId", condition = "#categoryId != null")
    public Set<UUID> descendantIds(UUID categoryId) {
        if (categoryId == null) {
            return Set.of();
        }
        // 1. 启用节点按 parentId 组成邻接表（禁用节点不进去，它的整支自然断开）
        Map<UUID, List<UUID>> childrenByParent = new HashMap<>();
        for (Category c : categoryMapper.selectList(new LambdaQueryWrapper<Category>())) {
            if (c.isEnabled()) {
                childrenByParent
                        .computeIfAbsent(c.getParentId(), key -> new ArrayList<>())
                        .add(c.getId());
            }
        }
        // 2. 从根逐层展开可达集：只有父链完整可见的节点才算可见（禁用中间节点挡住整支）
        Set<UUID> reachable = new LinkedHashSet<>();
        Deque<UUID> queue = new ArrayDeque<>(childrenByParent.getOrDefault(Category.ROOT_PARENT_ID, List.of()));
        while (!queue.isEmpty()) {
            UUID id = queue.poll();
            if (reachable.add(id)) {
                queue.addAll(childrenByParent.getOrDefault(id, List.of()));
            }
        }
        // 3. 目标不可达 → 空集；可达则从它向下收集（含自身）
        if (!reachable.contains(categoryId)) {
            return Set.of();
        }
        return expandSubtree(categoryId, childrenByParent);
    }

    /** 在给定邻接表上从 root 向下展开子树（含自身）；root 不在邻接表里时就是它自己一个点 */
    private static Set<UUID> expandSubtree(UUID root, Map<UUID, List<UUID>> childrenByParent) {
        Set<UUID> subtree = new LinkedHashSet<>();
        Deque<UUID> pending = new ArrayDeque<>(List.of(root));
        while (!pending.isEmpty()) {
            UUID id = pending.poll();
            if (subtree.add(id)) {
                pending.addAll(childrenByParent.getOrDefault(id, List.of()));
            }
        }
        return subtree;
    }

    /**
     * 全量子树（含自身，不按启用过滤）：禁用闸门专用。
     *
     * <p>与 {@link #descendantIds} 的「禁用整支剪掉」口径刻意不同——那是给召回看「买家此刻可达哪些」，
     * 这是关门前清点「这次禁用会波及谁」：子树里已有禁用分支下的商品同样在这个类目治下，
     * 禁祖先不会让它们更可见，也必须一并移走，所以展开时不掺启用过滤。
     */
    private Set<UUID> wholeSubtreeIds(UUID root) {
        Map<UUID, List<UUID>> childrenByParent = new HashMap<>();
        for (Category c : categoryMapper.selectList(new LambdaQueryWrapper<Category>())) {
            childrenByParent
                    .computeIfAbsent(c.getParentId(), key -> new ArrayList<>())
                    .add(c.getId());
        }
        return expandSubtree(root, childrenByParent);
    }

    /**
     * 商品挂载闸门（创建 / 编辑改挂共用）：类目必须存在、启用、叶子（level=3，同 {@link CategoryAttrService}
     * 属性模板的挂载规则）。违例 code：CATEGORY_DISABLED / CATEGORY_NOT_LEAF（400，前端 toast 显示 detail）。
     *
     * <p>禁用判定与 {@link #publicTree()} 的「父级不可见整支剪掉」同一口径：父链上任一节点禁用，
     * 挂上去的商品就会悬在买家侧不可见的类目里，所以逐级上溯检查整条父链——类目至多三级，
     * 最多再两次按主键点查，比展开整棵树便宜，不必只查挂载类目自身。
     * 顺序取「自身禁用 → 非叶子 → 父链禁用」：类目自身禁用是最致命的原因，先报它。
     */
    public void requireMountableCategory(UUID categoryId) {
        Category category = Validate.notNull(categoryMapper.selectById(categoryId), "分类不存在");
        Validate.isTrue(category.isEnabled(), "CATEGORY_DISABLED", "不能挂载到已禁用的类目");
        Validate.isTrue(category.getLevel() == MAX_LEVEL, "CATEGORY_NOT_LEAF", "商品只能挂载到叶子类目（三级）");
        // 父链向上走：ROOT_PARENT_ID 占位即到头；断链（父不存在）由创建侧唯一约束保证，不在此拦
        for (UUID parentId = category.getParentId(); parentId != null && !Category.ROOT_PARENT_ID.equals(parentId); ) {
            Category parent = categoryMapper.selectById(parentId);
            Validate.isTrue(parent == null || parent.isEnabled(), "CATEGORY_DISABLED", "不能挂载到父级已禁用的类目");
            parentId = parent == null ? null : parent.getParentId();
        }
    }

    /** 创建类目，level 由父级推导，最多三级 */
    @Transactional
    @Caching(
            evict = {
                @CacheEvict(cacheNames = CacheNames.CATEGORY_TREE, allEntries = true),
                @CacheEvict(cacheNames = CacheNames.CATEGORY_SUBTREE, allEntries = true)
            })
    public Category create(UUID parentId, String name, Integer sort, String iconUrl) {
        // 1. 推导层级：根节点 level=1；有父则校验父存在、启用且不超三级
        int level = 1;
        if (parentId != null && !Category.ROOT_PARENT_ID.equals(parentId)) {
            Category parent = Validate.notNull(categoryMapper.selectById(parentId), "父类目不存在");
            Validate.isTrue(parent.isEnabled(), "父类目已禁用，不能在其下创建");
            level = parent.getLevel() + 1;
            Validate.isTrue(level <= MAX_LEVEL, "最多支持三级类目");
        }
        // 2. 组装节点：根用 ROOT_PARENT_ID 占位，默认启用、排序 0
        Category category = Category.builder()
                .parentId(parentId != null ? parentId : Category.ROOT_PARENT_ID)
                .name(name)
                .level(level)
                .sort(sort != null ? sort : 0)
                .status(CategoryStatus.ENABLED)
                .iconUrl(iconUrl)
                .build();
        // 3. 落库：uk_categories_parent_name 唯一索引兜底并发下的同级重名
        DuplicateKeys.conflictOnDuplicate(() -> categoryMapper.insert(category), "同级下已存在同名类目");
        return category;
    }

    /** 更新名称/排序/图标。parentId 创建后不可改（不支持移动节点，见架构文档） */
    @Transactional
    @Caching(
            evict = {
                @CacheEvict(cacheNames = CacheNames.CATEGORY_TREE, allEntries = true),
                @CacheEvict(cacheNames = CacheNames.CATEGORY_SUBTREE, allEntries = true)
            })
    public Category update(UUID id, String name, Integer sort, String iconUrl) {
        Category category = requireCategory(id);
        category.setName(name);
        category.setSort(sort != null ? sort : 0);
        category.setIconUrl(iconUrl);
        DuplicateKeys.conflictOnDuplicate(() -> categoryMapper.updateById(category), "同级下已存在同名类目");
        return category;
    }

    /**
     * 启用/禁用。禁用采用查询侧裁剪，不写扩散，可无损恢复；子树内仍被商品引用的类目禁止禁用——
     * 否则商品会悬在一个买家侧不可见的类目里。
     */
    @Transactional
    @Caching(
            evict = {
                @CacheEvict(cacheNames = CacheNames.CATEGORY_TREE, allEntries = true),
                @CacheEvict(cacheNames = CacheNames.CATEGORY_SUBTREE, allEntries = true)
            })
    public void updateStatus(UUID id, CategoryStatus status) {
        Category category = requireCategory(id);
        // 禁用闸门：子树（含自身）内仍有商品引用（含草稿/下架——软删语义的商品仍占类目位）则拒绝。
        // 商品只挂三级叶子，对一级/二级数直挂引用恒为 0，必须按全量子树统计（口径见 wholeSubtreeIds）
        if (status == CategoryStatus.DISABLED) {
            Long refs = productMapper.selectCount(
                    new LambdaQueryWrapper<Product>().in(Product::getCategoryId, wholeSubtreeIds(id)));
            Validate.isTrue(refs == 0, "该类目或其子分类下仍有 " + refs + " 个商品，移出后才能禁用");
        }
        category.setStatus(status);
        categoryMapper.updateById(category);
    }

    private Category requireCategory(UUID id) {
        return Validate.notNull(categoryMapper.selectById(id), "类目不存在");
    }

    private List<CategoryNode> buildTree(boolean includeDisabled) {
        // 1. 全量加载，按「是否含禁用」过滤出可见节点
        List<Category> all = categoryMapper.selectList(new LambdaQueryWrapper<Category>());
        Map<UUID, Category> visible = new HashMap<>();
        for (Category c : all) {
            if (includeDisabled || c.isEnabled()) {
                visible.put(c.getId(), c);
            }
        }
        // 2. 父级不可见则整支剪掉（禁用级联口径，规则见 docs/business-rules/product.md PRD-06）
        List<Category> attachable = new ArrayList<>();
        for (Category c : visible.values()) {
            if (Category.ROOT_PARENT_ID.equals(c.getParentId()) || visible.containsKey(c.getParentId())) {
                attachable.add(c);
            }
        }
        // 3. 按 parentId 分组，从根递归组装成树
        Map<UUID, List<Category>> grouped = attachable.stream().collect(Collectors.groupingBy(Category::getParentId));
        return toNodes(grouped, Category.ROOT_PARENT_ID);
    }

    private List<CategoryNode> toNodes(Map<UUID, List<Category>> grouped, UUID parentId) {
        return grouped.getOrDefault(parentId, List.of()).stream()
                .sorted(Comparator.comparing(Category::getSort).thenComparing(Category::getCreatedAt))
                .map(c -> CategoryNode.from(c, toNodes(grouped, c.getId())))
                .toList();
    }
}
