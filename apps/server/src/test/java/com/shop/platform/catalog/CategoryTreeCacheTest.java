package com.shop.platform.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.catalog.dto.CategoryTreeNode;
import com.shop.platform.catalog.service.CatalogConfigService;
import com.shop.platform.catalog.service.CategoryBrowseService;
import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.cache.CacheNames;
import com.shop.platform.testsupport.IntegrationTest;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.cache.interceptor.SimpleKey;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 类目树缓存的契约：读命中、写后（事务提交）失效立即可见。
 *
 * <p>失效时机是这套缓存唯一容易错的地方——{@code transactionAware} 把 {@code @CacheEvict}
 * 推迟到提交后，没有它「改配置的请求还没提交，另一个请求已把旧值写回缓存」的竞态会钉死脏数据。
 * 所以这里测的是「提交之后的读」，不是方法返回时刻。
 */
class CategoryTreeCacheTest extends IntegrationTest {

    @Autowired
    private CategoryBrowseService browse;

    @Autowired
    private CatalogConfigService config;

    @Autowired
    private CacheManager cacheManager;

    @Autowired
    private JdbcTemplate jdbc;

    /** 读完即入缓存；二次读拿到的是缓存里那份（值类型正确反序列化成 CategoryTreeNode）。 */
    @Test
    void 二次读命中缓存且类型正确() {
        UUID leaf = seedActiveLeaf();

        List<CategoryTreeNode> first = browse.buyerTree();
        assertThat(contains(first, leaf)).isTrue();

        var cached = cacheManager.getCache(CacheNames.CATALOG_BUYER_TREE).get(SimpleKey.EMPTY);
        assertThat(cached).as("同 JVM 上下文里第二次读应命中缓存").isNotNull();
        assertThat(contains(browse.buyerTree(), leaf)).isTrue();
    }

    /** 写路径提交后缓存失效：下一次读立刻看到新数据，不等 TTL。 */
    @Test
    void 提交后的写立刻使缓存失效() throws Exception {
        UUID leaf = seedActiveLeaf();
        browse.buyerTree();

        config.updateSort(leaf, 7, Ids.newId());

        try (var c = redisConnectionFactory.getConnection()) {
            c.keyCommands().keys("*".getBytes()).forEach(k -> System.out.println("KEY_AFTER=" + new String(k)));
        }
        System.out.println("ADVISORS="
                + java.util.Arrays.stream(((org.springframework.aop.framework.Advised) config).getAdvisors())
                        .map(a -> a.getAdvice().getClass().getSimpleName())
                        .toList());
        System.out.println("BEFORE_READ="
                + (cacheManager.getCache(CacheNames.CATALOG_BUYER_TREE).get(SimpleKey.EMPTY) != null));
        List<CategoryTreeNode> tree = browse.buyerTree();
        System.out.println("AFTER_READ="
                + (cacheManager.getCache(CacheNames.CATALOG_BUYER_TREE).get(SimpleKey.EMPTY) != null) + " SORT="
                + findIn(tree, leaf).sort());
        CategoryTreeNode node = findIn(tree, leaf);
        assertThat(node).as("提交后缓存已失效，新读应包含该类目").isNotNull();
        assertThat(node.sort()).isEqualTo(7);
    }

    private UUID seedActiveLeaf() {
        // 叶子按 level >= 3 推导（CategoryRow.LEAF_LEVEL），必须种成三级才是叶子，
        // 否则 prune 会把无子的"分组"裁掉。根节点是它自己：tree() 只按 parent_id 组装。
        UUID id = Ids.newId();
        jdbc.update(
                "INSERT INTO catalog.category (id, path, level, code, name) VALUES (?, ?, 3, ?, '缓存契约测试')",
                id,
                "/" + id + "/" + id + "/" + id + "/",
                "cache-cat-" + id.toString().substring(28));
        return id;
    }

    private boolean contains(List<CategoryTreeNode> nodes, UUID id) {
        for (CategoryTreeNode node : nodes) {
            if (node.id().equals(id) || contains(node.children(), id)) {
                return true;
            }
        }
        return false;
    }

    private CategoryTreeNode findIn(List<CategoryTreeNode> nodes, UUID id) {
        for (CategoryTreeNode node : nodes) {
            if (node.id().equals(id)) {
                return node;
            }
            var hit = findIn(node.children(), id);
            if (hit != null) {
                return hit;
            }
        }
        return null;
    }
}
