import { CmsPublicApi } from "@shop/api/sdk"

import { toBanner, toNavEntry, type Banner, type NavEntry } from "./model"

import type { Product } from "#/products"
import { fetchProducts } from "#/products"

/**
 * Home 数据层读写命令（纯逻辑，不含 React Query / React）。
 * home/queries.ts 在此之上定义 queryOptions，route loader 预热、组件直接 useQuery 读。
 * 首页为公开读：cms /api/cms/* 与 /api/products 均匿名可访问（见后端 JwtProperties.skipPaths）。
 * 走生成 SDK 的 CmsPublicApi / ProductsApi（内置 SSR 双地址由 sdk-client 统一处理），不再自建客户端。
 */

/** 首页分类导航（前端在 SSR/客户端均可调，数据小走缓存） */
export async function fetchHomeNav(): Promise<NavEntry[]> {
    const res = await CmsPublicApi.getHomeNav({ query: { navKey: "home" } })
    return res.map(toNavEntry)
}

/** 首页运营位 banner */
export async function fetchBanners(): Promise<Banner[]> {
    const res = await CmsPublicApi.getHomeBanners({ query: { slot: "home_promo" } })
    return res.map(toBanner)
}

/**
 * 首页商品流（买家侧“猜你喜欢”占位：现复用全站上新 /api/products）。
 * TODO: 待后端暴露 /api/home/feed 推荐流后替换数据源；sales/tags/shop 后端 ProductResponse 暂缺，卡片先不映射。
 */
export async function fetchFeedProducts(): Promise<Product[]> {
    const page = await fetchProducts({ page: 1, size: 12, sort: "newest" })
    return page.records
}
