/**
 * Recommend 模块 — 首页 feed 流的编排：种子生成、游标编解码、召回参数拼装、末页判定。
 *
 * <p>V1 没有自己的 schema / 表（曝光与点击 V3 才来，见 docs/decisions/home-feed.md）——模块可以先没有表，
 * 有表的模块必须独占自己的 schema。召回能力来自 {@code product :: api} 的
 * {@code ProductRecallQuery}：本模块不认识商品表，也不过滤商品。
 *
 * <p>V2 读收藏 / 购物车 / 订单的用户信号时再加 {@code favorite / cart / order :: api}——方向与那三者已有的
 * {@code → product :: api} 同向，不成环。
 */
@ApplicationModule(
        displayName = "Recommend",
        allowedDependencies = {"product :: api"})
package com.shop.platform.recommend;

import org.springframework.modulith.ApplicationModule;
