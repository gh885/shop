package com.shop.platform.infra.cache;

import java.util.Set;

/**
 * 缓存名单：全站允许存在的缓存，唯一登记处。
 *
 * <p>规则与 {@code CacheNames} 的 main 分支版一致：<b>未在 ALL 里登记的缓存名启动即失败</b>。
 * 「静默不缓存」比不缓存更糟——你以为有缓存其实每次都在打库，还查不出来。新增缓存：
 * ① 这里加名字；② owning 模块在自己包里声明 {@link CacheSpec}；③ 写路径挂 {@code @CacheEvict}。
 */
public final class CacheNames {

    /** 买家导航树（active 叶子）。数据源 catalog.category，写侧全量失效。 */
    public static final String CATALOG_BUYER_TREE = "catalog:buyer-tree";

    /** 卖家选类目树（active + frozen）。同上。 */
    public static final String CATALOG_SELLER_TREE = "catalog:seller-tree";

    public static final Set<String> ALL = Set.of(CATALOG_BUYER_TREE, CATALOG_SELLER_TREE);

    private CacheNames() {}
}
