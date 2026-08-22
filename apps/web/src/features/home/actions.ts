import { z } from "zod"

import { createApiClient } from "@shop/api"

import { fetchProducts, type Product } from "#/entities/product"

import {
    BannerSchema,
    NavEntrySchema,
    RecommendTabSchema,
    type Banner,
    type NavEntry,
    type RecommendTab,
} from "./model"

/**
 * Home 数据层读写命令（纯逻辑，不含 React Query / React）。
 * features 在此之上再包 hooks（use-home.ts）。
 * 首页为公开读：cms /api/cms/* 与 /api/products 均匿名可访问（见后端 JwtProperties.skipPaths）。
 */

/** 后端源（SSR 端无法走 Vite proxy，需显式地址；默认 dev 后端，可用 VITE_API_ORIGIN 覆盖）。
 * 商品流已切到 entities/product（自带 SSR 双地址），此处仅剩 cms 接口在用。 */
const RAW_API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:8080"

// SSR（route loader）用绝对后端地址直连；浏览器端保持空串走 Vite proxy 同源相对路径
const raw = createApiClient(import.meta.env.SSR ? RAW_API_ORIGIN : "").raw

/** 首页分类导航（前端在 SSR/客户端均可调，数据小走缓存） */
export async function fetchHomeNav(): Promise<NavEntry[]> {
    return z
        .array(NavEntrySchema)
        .parse(await raw.get("api/cms/nav", { searchParams: { navKey: "home" } }).json())
}

/** 首页运营位 banner */
export async function fetchBanners(): Promise<Banner[]> {
    return z
        .array(BannerSchema)
        .parse(await raw.get("api/cms/banners", { searchParams: { slot: "home_promo" } }).json())
}

/** 首页推荐条词条 */
export async function fetchRecommendTabs(): Promise<RecommendTab[]> {
    return z.array(RecommendTabSchema).parse(await raw.get("api/cms/recommend-tabs").json())
}

/**
 * 首页商品流（买家侧“猜你喜欢”占位：现复用全站上新 /api/products）。
 * TODO: 待后端暴露 /api/home/feed 推荐流后替换数据源；sales/tags/shop 后端 ProductResponse 暂缺，卡片先不映射。
 */
export async function fetchFeedProducts(): Promise<Product[]> {
    const page = await fetchProducts({ page: 1, size: 12, sort: "newest" })
    return page.records
}
