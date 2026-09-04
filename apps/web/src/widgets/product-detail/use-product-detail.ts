import { queryOptions, useQuery } from "@tanstack/react-query"
import { PublicShopsApi } from "@shop/api/sdk"

import { fetchProductDetail, fetchProducts } from "#/product"
import type { ProductDetail } from "#/product"

/**
 * 商品详情数据 hooks：route loader 用 queryOptions 预热，组件 useQuery 读同一缓存
 * （与 widgets/home/use-home 相同的 SSR-query 模式）。
 */

// 商品详情缓存久一点：详情页停留期间不需要失效，改价靠刷新页面
const CACHE = 5 * 60_000

export const productDetailOptions = (id: string) =>
    queryOptions({
        queryKey: ["product-detail", id],
        queryFn: () => fetchProductDetail(id),
        staleTime: CACHE,
        retry: false,
    })

// ---------- 店铺公开信息（GET /api/shops/{id}，匿名可访问） ----------

/** 店铺公开信息：仅对外可展示字段（后端 ShopPublicController.ShopResponse） */
export interface PublicShop {
    id: string
    name: string
    /** 对象存储 key（非完整 URL），可能为空 */
    logoKey?: string
}

async function fetchShopPublic(shopId: string): Promise<PublicShop> {
    const d = await PublicShopsApi.getPublicShop({ path: { id: shopId } })
    return { id: d.id, name: d.name, logoKey: d.logoKey ?? undefined }
}

export const shopOptions = (shopId: string) =>
    queryOptions({
        queryKey: ["shop-public", shopId],
        queryFn: () => fetchShopPublic(shopId),
        staleTime: CACHE,
        retry: false,
    })

// ---------- 推荐流：本店推荐（同店商品）/ 看了又看（全站上新占位）----------

/** 后端暂无推荐接口，先复用全站商品列表按条件拉取；仅客户端拉取（不入 loader，不拖慢首屏） */
export const shopProductsOptions = (shopId: string) =>
    queryOptions({
        queryKey: ["shop-products", shopId],
        queryFn: () => fetchProducts({ page: 1, size: 11, shopId }),
        staleTime: CACHE,
        retry: false,
    })

export const alsoViewedOptions = queryOptions({
    queryKey: ["also-viewed-products"],
    queryFn: () => fetchProducts({ page: 1, size: 11, sort: "newest" }),
    staleTime: CACHE,
    retry: false,
})

// ---------- hooks ----------

export function useProductDetail(id: string): ProductDetail | undefined {
    return useQuery(productDetailOptions(id)).data
}

/** shopId 未就绪前不发请求（enabled 关掉） */
export function useShop(shopId: string | undefined): PublicShop | undefined {
    return useQuery({ ...shopOptions(shopId ?? "pending"), enabled: !!shopId }).data
}
