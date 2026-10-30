package com.shop.platform.catalog.internal;

import com.shop.platform.catalog.dto.CategoryTreeNode;
import com.shop.platform.infra.cache.CacheNames;
import com.shop.platform.infra.cache.CacheSpec;
import java.time.Duration;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * catalog 的缓存形状登记。名字必须同时出现在 {@link CacheNames#ALL}，双向 fail-fast。
 *
 * <p>两棵树（买家导航 / 卖家选类目）是同一份数据的两种裁剪，分开缓存而不是缓存原树再裁：
 * 裁剪发生在每次请求的调用栈里，缓存原树等于把 CPU 开销留在读路径上，只省了 DB。
 */
@Configuration
public class CatalogCacheConfig {

    private static final Duration TREE_TTL = Duration.ofMinutes(5);

    @Bean
    public List<CacheSpec> catalogCacheSpecs() {
        return List.of(
                CacheSpec.list(CacheNames.CATALOG_BUYER_TREE, CategoryTreeNode.class, TREE_TTL),
                CacheSpec.list(CacheNames.CATALOG_SELLER_TREE, CategoryTreeNode.class, TREE_TTL));
    }
}
