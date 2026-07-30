package com.shop.platform.product.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shop.platform.common.BusinessException;
import com.shop.platform.product.mapper.Category;
import com.shop.platform.product.mapper.CategoryMapper;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.Builder;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CategoryService {

    public static final int STATUS_ENABLED = 1;
    public static final int STATUS_DISABLED = 0;

    private static final int MAX_LEVEL = 3;

    private final CategoryMapper categoryMapper;

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
        int level = 1;
        if (parentId != null && !Category.ROOT_PARENT_ID.equals(parentId)) {
            Category parent = categoryMapper.selectById(parentId);
            if (parent == null) {
                throw BusinessException.notFound("父类目不存在");
            }
            if (parent.getStatus() != STATUS_ENABLED) {
                throw BusinessException.badRequest("父类目已禁用，不能在其下创建");
            }
            level = parent.getLevel() + 1;
            if (level > MAX_LEVEL) {
                throw BusinessException.badRequest("最多支持三级类目");
            }
        }
        Category category =
                Category.builder()
                        .parentId(parentId != null ? parentId : Category.ROOT_PARENT_ID)
                        .name(name)
                        .level(level)
                        .sort(sort != null ? sort : 0)
                        .status(STATUS_ENABLED)
                        .iconUrl(iconUrl)
                        .build();
        try {
            categoryMapper.insert(category);
        } catch (DuplicateKeyException e) {
            // uk_categories_parent_name 兜底并发下的同级重名
            throw BusinessException.conflict(null, "同级下已存在同名类目");
        }
        return category;
    }

    /** 更新名称/排序/图标。parentId 创建后不可改（不支持移动节点，见架构文档） */
    @Transactional
    public Category update(UUID id, String name, Integer sort, String iconUrl) {
        Category category = getOrThrow(id);
        category.setName(name);
        category.setSort(sort != null ? sort : 0);
        category.setIconUrl(iconUrl);
        try {
            categoryMapper.updateById(category);
        } catch (DuplicateKeyException e) {
            throw BusinessException.conflict(null, "同级下已存在同名类目");
        }
        return category;
    }

    /** 启用/禁用。禁用采用查询侧裁剪，不写扩散，可无损恢复 */
    @Transactional
    public void updateStatus(UUID id, int status) {
        Category category = getOrThrow(id);
        // TODO(products 表落地后): 禁用时校验类目下无商品引用，否则拒绝
        category.setStatus(status);
        categoryMapper.updateById(category);
    }

    private Category getOrThrow(UUID id) {
        Category category = categoryMapper.selectById(id);
        if (category == null) {
            throw BusinessException.notFound("类目不存在");
        }
        return category;
    }

    private List<CategoryNode> buildTree(boolean includeDisabled) {
        List<Category> all = categoryMapper.selectList(Wrappers.emptyWrapper());
        Map<UUID, Category> visible = new HashMap<>();
        for (Category c : all) {
            if (includeDisabled || c.getStatus() == STATUS_ENABLED) {
                visible.put(c.getId(), c);
            }
        }
        // 父级不可见则整支剪掉（禁用级联的实现方式，见 docs/product-architecture.md）
        List<Category> attachable = new ArrayList<>();
        for (Category c : visible.values()) {
            if (Category.ROOT_PARENT_ID.equals(c.getParentId())
                    || visible.containsKey(c.getParentId())) {
                attachable.add(c);
            }
        }
        Map<UUID, List<Category>> grouped =
                attachable.stream().collect(Collectors.groupingBy(Category::getParentId));
        return toNodes(grouped, Category.ROOT_PARENT_ID);
    }

    private List<CategoryNode> toNodes(Map<UUID, List<Category>> grouped, UUID parentId) {
        return grouped.getOrDefault(parentId, List.of()).stream()
                .sorted(
                        Comparator.comparing(Category::getSort)
                                .thenComparing(Category::getCreatedAt))
                .map(
                        c ->
                                CategoryNode.builder()
                                        .id(c.getId())
                                        .parentId(c.getParentId())
                                        .name(c.getName())
                                        .level(c.getLevel())
                                        .sort(c.getSort())
                                        .status(c.getStatus())
                                        .iconUrl(c.getIconUrl())
                                        .children(toNodes(grouped, c.getId()))
                                        .build())
                .toList();
    }

    @Builder
    public record CategoryNode(
            UUID id,
            UUID parentId,
            String name,
            Integer level,
            Integer sort,
            Integer status,
            String iconUrl,
            List<CategoryNode> children) {}
}
