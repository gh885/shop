package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.dto.CategoryTreeNode;
import com.shop.platform.catalog.model.CategoryStatus;
import com.shop.platform.infra.db.RowMappers;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 类目树的读写。<b>只管"在哪"，不管"要求什么"</b>——配置在 {@link CategoryConfigStore}。
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
@Component
public class CategoryStore {

    /** 叶子层级。三层定死，前端 CATEGORY_MAX_LEVEL 也是这个数。 */
    public static final int LEAF_LEVEL = 3;

    private static final String FIND =
            """
            SELECT id, parent_id, path, level, code, name, status, sort, created_at, updated_at
              FROM catalog.category
             WHERE id = :id
            """;

    private static final String FIND_TREE =
            """
            SELECT id, parent_id, level, code, name, sort, status
              FROM catalog.category
             ORDER BY level, sort, code
            """;

    private static final String INSERT =
            """
            INSERT INTO catalog.category (id, parent_id, path, level, code, name, status, sort)
            VALUES (:id, :parentId, :path, :level, :code, :name, :status, :sort)
            """;

    private static final String UPDATE_STATUS = "UPDATE catalog.category SET status = :status WHERE id = :id";

    private static final String UPDATE_SORT = "UPDATE catalog.category SET sort = :sort WHERE id = :id";

    private static final String UPDATE_NAME = "UPDATE catalog.category SET name = :name WHERE id = :id";

    private static final String CODE_EXISTS = "SELECT 1 FROM catalog.category WHERE code = :code";

    private final JdbcClient jdbc;

    public CategoryStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public Optional<CategoryRow> find(UUID categoryId) {
        return jdbc.sql(FIND)
                .param("id", categoryId)
                .query(RowMappers.of(CategoryRow.class))
                .optional();
    }

    /** 全量树。类目就几千个节点，一次拉全比逐层查省事且结果自洽。 */
    public List<CategoryTreeNode> tree() {
        List<TreeRow> rows =
                jdbc.sql(FIND_TREE).query(RowMappers.of(TreeRow.class)).list();

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

    private CategoryTreeNode toNode(TreeRow row, Map<UUID, List<TreeRow>> byParent) {
        List<CategoryTreeNode> children = byParent.getOrDefault(row.id(), List.of()).stream()
                .map(child -> toNode(child, byParent))
                .toList();
        boolean leaf = row.level() >= LEAF_LEVEL;
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

    public boolean codeExists(String code) {
        return jdbc.sql(CODE_EXISTS)
                .param("code", code)
                .query(Integer.class)
                .optional()
                .isPresent();
    }

    public void insert(
            UUID id, UUID parentId, String path, int level, String code, String name, CategoryStatus status, int sort) {
        jdbc.sql(INSERT)
                .param("id", id)
                .param("parentId", parentId)
                .param("path", path)
                .param("level", level)
                .param("code", code)
                .param("name", name)
                .param("status", status.dbValue())
                .param("sort", sort)
                .update();
    }

    public boolean updateStatus(UUID categoryId, CategoryStatus status) {
        return jdbc.sql(UPDATE_STATUS)
                        .param("status", status.dbValue())
                        .param("id", categoryId)
                        .update()
                == 1;
    }

    public boolean updateSort(UUID categoryId, int sort) {
        return jdbc.sql(UPDATE_SORT).param("sort", sort).param("id", categoryId).update() == 1;
    }

    public boolean updateName(UUID categoryId, String name) {
        return jdbc.sql(UPDATE_NAME).param("name", name).param("id", categoryId).update() == 1;
    }

    /**
     * 树结构的一行。只有描述位置需要的列——没有任何"配置"。
     *
     * @param level 3 才是叶子。{@code leaf()} 由它推导，不存列
     */
    public record CategoryRow(
            UUID id,
            UUID parentId,
            String path,
            short level,
            String code,
            String name,
            CategoryStatus status,
            int sort,
            Instant createdAt,
            Instant updatedAt) {

        public boolean leaf() {
            return level >= LEAF_LEVEL;
        }

        /** 能不能往上挂商品：叶子 + active。frozen 只拦新建，closed 连下单都拦。 */
        public boolean mountable() {
            return leaf() && status.mountable();
        }
    }

    private record TreeRow(UUID id, UUID parentId, short level, String code, String name, int sort, String status) {}

    /** 建类目时按父类目算 path。根节点 parentPath 为 null。 */
    public static String pathOf(String parentPath, UUID selfId) {
        String prefix = parentPath == null ? "/" : parentPath;
        if (!prefix.endsWith("/")) {
            prefix = prefix + "/";
        }
        return prefix + selfId + "/";
    }

    /** 解析 path 里的祖先 id 列表，按从根到父的顺序。一次库都不用查。 */
    public static List<UUID> ancestorsOf(String path, UUID selfId) {
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
