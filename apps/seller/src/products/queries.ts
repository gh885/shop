import { queryOptions, useQuery } from "@tanstack/react-query"

import type { ProductResponse } from "@shop/api/sdk"
import { CategoriesApi } from "@shop/api/sdk"

import { listProducts } from "./data"
import { type LeafPath, flattenLeafPaths } from "./category"

/**
 * products 域的 TanStack Query 定义层：只放**声明式、无状态**的 query 定义与 key 工厂。
 *
 * - 所有 queryKey 集中在此（前缀结构一眼可见，invalidate 不会漏 key）；
 * - 有状态的编排 hooks（useProductDraft / useProductList 这类视图模型）留在页面旁，
 *   内部消费本文件的 options，不放进来。
 */

// ---------- queryKey 工厂 ----------

export interface ProductListSearch {
    status?: string
    keyword?: string
    page: number
    size: number
}

export const productKeys = {
    all: ["products"] as const,
    lists: (shopId?: string) => ["products", shopId] as const,
    list: (shopId: string | undefined, s: ProductListSearch) =>
        ["products", shopId, s.status ?? "all", s.keyword ?? "", s.page, s.size] as const,
    detail: (id: string) => ["products", "detail", id] as const,
}

const categoryKeys = {
    tree: ["categories", "tree"] as const,
}

// ---------- query 定义 ----------

/** 店铺商品分页列表（shopId 入 key：切店铺不串缓存） */
export const productListOptions = (shopId: string | undefined, s: ProductListSearch) =>
    queryOptions({
        queryKey: productKeys.list(shopId, s),
        queryFn: () =>
            listProducts({
                page: s.page,
                size: s.size,
                status: s.status as ProductResponse["status"] | undefined,
                keyword: s.keyword,
            }),
        enabled: !!shopId,
        placeholderData: (prev) => prev,
    })

/** 类目树：低频变更公共数据，全量拉一次长缓存，页面内搜索/级联都在这份树上算 */
const categoryTreeOptions = queryOptions({
    queryKey: categoryKeys.tree,
    queryFn: () => CategoriesApi.getCategoryTree(),
    staleTime: 10 * 60_000,
})

export function useCategoryTree() {
    return useQuery(categoryTreeOptions)
}

/** 末级路径清单（搜索语料）：树没变编译器自动缓存，不重复展平 */
export function useLeafPaths(): LeafPath[] {
    const { data } = useCategoryTree()
    return flattenLeafPaths(data ?? [])
}
