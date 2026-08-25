import { z } from "zod"

import {
    BannerSchema,
    NavEntrySchema,
    RecommendTabSchema,
    type Banner,
    type NavEntry,
    type RecommendTab,
} from "./model"

import type { Product } from "#/entities/product"
import { publicClient } from "#/shared/api/public"

import { fetchProducts } from "#/entities/product/actions"

/**
 * Home 数据层读写命令（纯逻辑，不含 React Query / React）。
 * features 在此之上再包 hooks（use-home.ts）。
 * 首页为公开读：cms /api/cms/* 与 /api/products 均匿名可访问（见后端 JwtProperties.skipPaths）。
 * 复用 shared/api/public 的 publicClient（自带 SSR 双地址），不再自建客户端实例。
 */

/** 首页分类导航（前端在 SSR/客户端均可调，数据小走缓存） */
export async function fetchHomeNav(): Promise<NavEntry[]> {
    return publicClient.request(z.array(NavEntrySchema), "api/cms/nav", {
        searchParams: { navKey: "home" },
    })
}

/** 首页运营位 banner */
export async function fetchBanners(): Promise<Banner[]> {
    return publicClient.request(z.array(BannerSchema), "api/cms/banners", {
        searchParams: { slot: "home_promo" },
    })
}

/** 首页推荐条词条 */
export async function fetchRecommendTabs(): Promise<RecommendTab[]> {
    return publicClient.request(z.array(RecommendTabSchema), "api/cms/recommend-tabs")
}

/**
 * 首页商品流（买家侧“猜你喜欢”占位：现复用全站上新 /api/products）。
 * TODO: 待后端暴露 /api/home/feed 推荐流后替换数据源；sales/tags/shop 后端 ProductResponse 暂缺，卡片先不映射。
 */
export async function fetchFeedProducts(): Promise<Product[]> {
    const page = await fetchProducts({ page: 1, size: 12, sort: "newest" })
    return page.records
}
