import { queryOptions, useQuery } from "@tanstack/react-query"
import { PublicShopsApi } from "@shop/api/sdk"
import type { PublicShopResponse } from "@shop/api/sdk"

import { fetchProductDetail, fetchProducts } from "#/product"

/**
 * 商品详情数据 hooks：route loader 用 queryOptions 预热，组件 useQuery 读同一缓存
 * （与 widgets/home/queries 相同的 SSR-query 模式）。
 *
 * queryKey 用生成 SDK 的 key 工厂（契约同步、参数类型受检），投影 queryFn 本地保留。
 */

// 商品详情缓存久一点：详情页停留期间不需要失效，改价靠刷新页面
const CACHE = 5 * 60_000

export const productDetailOptions = (id: string) =>
    queryOptions({
        queryKey: ["product-detail", id],
        queryFn: ({ signal }) => fetchProductDetail(id, signal),
        staleTime: CACHE,
        retry: false,
    })

// ---------- 店铺公开信息（GET /api/shops/{id}，匿名可访问） ----------

/** 店铺公开信息：仅对外可展示字段（logoKey 归一可选，UI 显示字母头像） */
export type PublicShop = Pick<PublicShopResponse, "id" | "name"> & { logoKey?: string }

export const shopOptions = (shopId: string) =>
    queryOptions({
        queryKey: ["shop-public", shopId],
        queryFn: async ({ signal }): Promise<PublicShop> => {
            const d = await PublicShopsApi.getPublicShop({ path: { id: shopId }, signal })
            return { id: d.id, name: d.name, logoKey: d.logoKey ?? undefined }
        },
        staleTime: CACHE,
        retry: false,
    })

// ---------- 推荐流：本店推荐（同店商品）/ 看了又看（全站上新占位）----------

/** 后端暂无推荐接口，先复用全站商品列表按条件拉取；仅客户端拉取（不入 loader，不拖慢首屏） */
export const shopProductsOptions = (shopId: string) =>
    queryOptions({
        queryKey: ["shop-products", shopId],
        queryFn: ({ signal }) => fetchProducts({ page: 1, size: 11, shopId }, signal),
        staleTime: CACHE,
        retry: false,
    })

export const alsoViewedOptions = queryOptions({
    queryKey: ["also-viewed-products"],
    queryFn: ({ signal }) => fetchProducts({ page: 1, size: 11, sort: "newest" }, signal),
    staleTime: CACHE,
    retry: false,
})

// ---------- hooks ----------

/** shopId 未就绪前不发请求（enabled 关掉） */
export function useShop(shopId: string | undefined): PublicShop | undefined {
    return useQuery({ ...shopOptions(shopId ?? "pending"), enabled: !!shopId }).data
}
