import { queryOptions } from "@tanstack/react-query"
import { ProductsApi, PublicShopsApi } from "@shop/api/sdk"
import type { PublicShopResponse } from "@shop/api/sdk"

import {
    toProduct,
    toProductDetail,
    type Product,
    type ProductDetail,
    type ProductListQueryInput,
} from "../product"

/**
 * 商品详情数据 hooks：route loader 用 queryOptions 预热，组件 useQuery 读同一缓存
 * （与 widgets/home/queries 相同的 SSR-query 模式）。
 *
 * queryKey 用生成 SDK 的 key 工厂（契约同步、参数类型受检），投影 queryFn 本地保留。
 */

// 数据层（纯异步函数，非 hook）// 规则/类型在 ../product.ts。真正的 React 接线（queryOptions）在本文件下方——
// 纯函数只在下方 queryOptions 里消费，对外一律暴露 options，不再裸导出取数函数。

/** 全站商品分页：卡片流/推荐/类目/搜索共用，返回领域形状 */
async function fetchProducts(
    input: ProductListQueryInput,
    signal?: AbortSignal,
): Promise<{ records: Product[]; total: number }> {
    const page = await ProductsApi.listPublicProducts({
        query: {
            pageParams: { page: input.page ?? 1, size: input.size ?? 20 },
            query: {
                categoryId: input.categoryId,
                shopId: input.shopId,
                keyword: input.keyword,
                sort: input.sort,
            },
        },
        signal,
    })
    return {
        records: page.records.map(toProduct),
        total: page.total,
    }
}

/** 商品详情：匿名可访问（公开页），返回领域形状 */
async function fetchProductDetail(id: string, signal?: AbortSignal): Promise<ProductDetail> {
    return toProductDetail(await ProductsApi.getPublicProductDetail({ path: { id }, signal }))
}

// 商品详情缓存久一点：详情页停留期间不需要失效，改价靠刷新页面
const CACHE = 5 * 60_000

export const productDetailOptions = (id: string) =>
    queryOptions({
        queryKey: ["product-detail", id],
        queryFn: ({ signal }) => fetchProductDetail(id, signal),
        staleTime: CACHE,
        retry: false,
    })

// 店铺公开信息（GET /api/shops/{id}，匿名可访问）
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

// 推荐流：本店推荐（同店商品）/ 看了又看（全站上新占位）
/** 后端暂无推荐接口，先复用全站商品列表按条件拉取。
 *  由推荐区块经 useSuspenseQuery + Suspense 走区块级流式（SSR 吐骨架、queryStream 补发），不进 route loader */
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

// hooks
// 店铺条的读取在 ShopBar 里直接 useSuspenseQuery(shopOptions(shopId)) + QueryBoundary：
// 挂起/失败/重试全走官方边界，不再需要「返回完整 query 结果 + onRetry」的包装 hook。
