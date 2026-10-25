package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.dto.CategoryTreeNode;
import com.shop.platform.catalog.model.CategoryStatus;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 类目树的读写。<b>只管"在哪"，不管"要求什么"</b>——配置在 {@link CategoryConfigMapper}。
 *
 * <p>这条分工是这次改动的核心。原来的表把"树结构"和"类目配置"混在一行里，于是
 * {@code identity_keys} 这类只对叶子有意义的列在 L1/L2 上永远是 NULL、永远不被读。
 * 拆开之后，{@code category} 的每一行都有意义（描述层级和位置），
 * {@code category_config} 只对叶子存在，读配置就是一条 {@code WHERE category_id = ?}。
 *
 * <p><b>{@code is_leaf} 不是存出来的列。</b> 三层定死之后，"是不是叶子"就是 {@code level = 3}，
 * 存一份就多一个会漂移的真相源——而原来那份确实漂了：插子类目时没人把父类目改成 false，
 * 于是 createDraft 靠它拦「往非叶子挂商品」这件事从来没真正生效过。
 */
@Mapper
public interface CategoryMapper {

    @Select(
            """
            SELECT id, parent_id, path, level, code, name, status, sort
              FROM catalog.category
             WHERE id = #{categoryId}
            """)
    Optional<CategoryRow> find(@Param("categoryId") UUID categoryId);

    /** 全量树。类目就几千个节点，一次拉全比逐层查省事且结果自洽。 */
    default List<CategoryTreeNode> tree() {
        List<TreeRow> rows = findTreeRows();

        Map<UUID, List<TreeRow>> byParent = new LinkedHashMap<>();
        List<TreeRow> roots = new ArrayList<>();
        for (TreeRow row : rows) {
            if (row.parentId() == null) {
                roots.add(row);
            } else {
                byParent.computeIfAbsent(row.parentId(), key -> new ArrayList<>())
                        .add(row);
            }
        }
        return roots.stream().map(root -> toNode(root, byParent)).toList();
    }

    /** 全量树的窄投影：画树只要位置列，状态按原文比对（toNode 里判 active）。 */
    @Select(
            """
            SELECT id, parent_id AS parentId, level, code, name, sort, status
              FROM catalog.category
             ORDER BY level, sort, code
            """)
    List<TreeRow> findTreeRows();

    private CategoryTreeNode toNode(TreeRow row, Map<UUID, List<TreeRow>> byParent) {
        List<CategoryTreeNode> children = byParent.getOrDefault(row.id(), List.of()).stream()
                .map(child -> toNode(child, byParent))
                .toList();
        boolean leaf = row.level() >= CategoryRow.LEAF_LEVEL;
        return new CategoryTreeNode(
                row.id(),
                row.parentId(),
                row.code(),
                row.name(),
                row.level(),
                row.sort(),
                row.status(),
                leaf,
                leaf && "active".equals(row.status()),
                children);
    }

    default boolean codeExists(String code) {
        return selectOneByCode(code) != null;
    }

    @Select("SELECT 1 FROM catalog.category WHERE code = #{code}")
    Integer selectOneByCode(@Param("code") String code);

    /** 建类目。时间列由数据库/触发器管，insert 不碰。 */
    @Insert(
            """
            INSERT INTO catalog.category (id, parent_id, path, level, code, name, status, sort)
            VALUES (#{id}, #{parentId}, #{path}, #{level}, #{code}, #{name}, #{status}, #{sort})
            """)
    void insert(
            @Param("id") UUID id,
            @Param("parentId") UUID parentId,
            @Param("path") String path,
            @Param("level") int level,
            @Param("code") String code,
            @Param("name") String name,
            @Param("status") CategoryStatus status,
            @Param("sort") int sort);

    /** 条件更新：影响 0 行说明这行刚被删了，调用方把它当冲突。 */
    @Update("UPDATE catalog.category SET status = #{status} WHERE id = #{categoryId}")
    boolean updateStatus(@Param("categoryId") UUID categoryId, @Param("status") CategoryStatus status);

    @Update("UPDATE catalog.category SET sort = #{sort} WHERE id = #{categoryId}")
    boolean updateSort(@Param("categoryId") UUID categoryId, @Param("sort") int sort);

    @Update("UPDATE catalog.category SET name = #{name} WHERE id = #{categoryId}")
    boolean updateName(@Param("categoryId") UUID categoryId, @Param("name") String name);

    /** 全量树的一行（窄投影）。与整行投影 {@link CategoryRow} 分开，各取所需。 */
    record TreeRow(UUID id, UUID parentId, short level, String code, String name, int sort, String status) {}

    /** 建类目时按父类目算 path。根节点 parentPath 为 null。 */
    static String pathOf(String parentPath, UUID selfId) {
        String prefix = parentPath == null ? "/" : parentPath;
        if (!prefix.endsWith("/")) {
            prefix = prefix + "/";
        }
        return prefix + selfId + "/";
    }

    /** 解析 path 里的祖先 id 列表，按从根到父的顺序。一次库都不用查。 */
    static List<UUID> ancestorsOf(String path, UUID selfId) {
        List<UUID> ancestors = new ArrayList<>();
        for (String segment : path.split("/")) {
            if (segment.isBlank()) {
                continue;
            }
            UUID id = UUID.fromString(segment);
            if (id.equals(selfId)) {
                break;
            }
            ancestors.add(id);
        }
        return List.copyOf(ancestors);
    }
}
