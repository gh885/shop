package com.shop.platform.infra.cache;

import java.util.Set;

/**
 * 读缓存的名字清单：读侧 {@code @Cacheable} 与写侧失效引同一批常量，不在两处各写一遍字符串。
 *
 * <p>这份清单是「哪些数据被缓存」的唯一入口。新增一个名字要配套两件事：拥有那份数据的模块在自己的
 * {@code <module>.infra} 里交一个 {@link CacheSpec}（值类型），否则启动即核对失败——不登记的后果本该是
 * 「静默不缓存」，那样线上看不出来，所以这里宁可开机报错。
 */
public final class CacheNames {

    /** 首页导航条目，按导航位（navKey）分键 */
    public static final String CMS_NAV = "cms:nav";

    /** 运营位 banner 的启用行（时间窗口过滤不进缓存，见 ContentService.banners） */
    public static final String CMS_BANNER = "cms:banner";

    /** 首页推荐条词条 */
    public static final String CMS_RECOMMEND_TAB = "cms:recommend-tab";

    /** 前台类目树（含禁用裁剪后的结果） */
    public static final String CATEGORY_TREE = "product:category-tree";

    /** 类目子树 id 集，按类目 id 分键 */
    public static final String CATEGORY_SUBTREE = "product:category-subtree";

    /** 店铺公开信息，按店铺 id 分键 */
    public static final String SHOP_PUBLIC = "shop:public";

    /** 全部缓存名：{@link CacheConfig} 按这份名单登记值类型，未登记的名字直接失败 */
    public static final Set<String> ALL =
            Set.of(CMS_NAV, CMS_BANNER, CMS_RECOMMEND_TAB, CATEGORY_TREE, CATEGORY_SUBTREE, SHOP_PUBLIC);

    private CacheNames() {}
}
