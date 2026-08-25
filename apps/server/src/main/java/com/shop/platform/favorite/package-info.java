/**
 * Favorite 模块 — 收藏夹（营销/留存域）
 *
 * <p>schema: favorite。SPU 级收藏（收藏的是商品不是规格），纯追加删除表：
 * 取消收藏 = DELETE，行永远不被 UPDATE。幂等开关：重复收藏不报错也不产生多行。
 * 商品卡片数据读取时经 product :: api 按 ID 只读批查拼装；
 * 降价提醒/推荐等营销能力是本模块未来的演化方向，与交易前置的 cart 分域。
 */
@ApplicationModule(
        displayName = "Favorite",
        allowedDependencies = {"product :: api"})
package com.shop.platform.favorite;

import org.springframework.modulith.ApplicationModule;
