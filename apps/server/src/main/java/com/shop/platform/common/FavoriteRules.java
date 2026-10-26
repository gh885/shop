package com.shop.platform.common;

/**
 * 收藏夹的数量口径。
 *
 * <p>为什么需要上限：收藏是「加一行」的操作，没有上限就等于给了一个往库里无限写行的入口——
 * 一个脚本每秒收藏 100 个不存在的 spuId，一天能长出 800 万行垃圾。
 * 购物车有同样的闸门（{@link CartRules#ITEM_KINDS_MAX}），两个数故意不同：
 * 收藏是「以后再买」，天然比「现在就想买」多一个数量级。
 *
 * <p>上限只管「新种类」，重复收藏同一个商品不占新坑——那是幂等的，不该因为车满而失败。
 */
public final class FavoriteRules {

    /** 收藏种类上限。按人均真实收藏量（几十到一两百）留足余量，同时把刷量挡在这个量级。 */
    public static final int ITEM_KINDS_MAX = 500;

    /** 一次批量查「收藏了吗」最多多少个 spuId。前端一屏商品卡片不会超过它。 */
    public static final int EXISTS_BATCH_MAX = 200;

    private FavoriteRules() {}
}
