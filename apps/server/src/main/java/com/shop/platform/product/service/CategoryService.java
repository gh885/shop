package com.shop.platform.product.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.db.DuplicateKeys;
import com.shop.platform.product.mapper.Category;
import com.shop.platform.product.mapper.CategoryMapper;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.ProductMapper;
import com.shop.platform.product.model.CategoryStatus;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CategoryService {

    private static final int MAX_LEVEL = 3;

    private final CategoryMapper categoryMapper;

    private final ProductMapper productMapper;

    /** 前台类目树：仅启用节点，禁用节点整支剪掉 */
    public List<CategoryNode> publicTree() {
        return buildTree(false);
    }

    /** 管理端类目树：全量，含禁用节点 */
    public List<CategoryNode> adminTree() {
        return buildTree(true);
    }

    /** 创建类目，level 由父级推导，最多三级 */
    @Transactional
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
    public Category update(UUID id, String name, Integer sort, String iconUrl) {
        Category category = requireCategory(id);
        category.setName(name);
        category.setSort(sort != null ? sort : 0);
        category.setIconUrl(iconUrl);
        DuplicateKeys.conflictOnDuplicate(() -> categoryMapper.updateById(category), "同级下已存在同名类目");
        return category;
    }

    /**
     * 启用/禁用。禁用采用查询侧裁剪，不写扩散，可无损恢复；仍被商品引用的类目禁止禁用——
     * 否则商品会悬在一个买家侧不可见的类目里。
     */
    @Transactional
    public void updateStatus(UUID id, CategoryStatus status) {
        Category category = requireCategory(id);
        // 禁用闸门：类目下仍有商品引用（含草稿/下架——软删语义的商品仍占类目位）则拒绝
        if (status == CategoryStatus.DISABLED) {
            Long refs = productMapper.selectCount(new LambdaQueryWrapper<Product>().eq(Product::getCategoryId, id));
            Validate.isTrue(refs == 0, "类目下仍有 " + refs + " 个商品，移出后才能禁用");
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
        // 2. 父级不可见则整支剪掉（禁用级联的实现方式，见 docs/product-architecture.md）
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
