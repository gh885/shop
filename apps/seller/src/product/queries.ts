import { queryOptions, skipToken, useQuery, useQueryClient } from "@tanstack/react-query"

import type { CategoryAttrNodeResponse, ProductStatus } from "@shop/api/sdk"
import { CategoriesApi, ProductsAdminApi } from "@shop/api/sdk"

import { listProducts } from "./data"
import { type LeafPath, flattenLeafPaths, toApiError } from "@shop/common"

// ---------- 商品列表排序契约 ----------

/** 卖家商品列表支持的全部排序方式（与后端 listShopProducts 的 sort 枚举一一对应） */
export const PRODUCT_SORTS = [
    "createdAt_desc",
    "createdAt_asc",
    "stock_asc",
    "stock_desc",
    "soldCount_asc",
    "soldCount_desc",
] as const

export type ProductSort = (typeof PRODUCT_SORTS)[number]

/**
 * products 域的 TanStack Query 定义层：只放**声明式、无状态**的 query 定义与 key 工厂。
 *
 * - 所有 queryKey 集中在此（前缀结构一眼可见，invalidate 不会漏 key）；
 * - 有状态的编排 hooks（useProductDraft / useProductList 这类视图模型）留在页面旁，
 *   内部消费本文件的 options，不放进来。
 */

// ---------- queryKey 工厂 ----------

export interface ProductListSearch {
    status?: ProductStatus
    keyword?: string
    sort?: ProductSort
    page: number
    size: number
}

export const productKeys = {
    all: ["products"] as const,
    lists: (shopId?: string) => ["products", shopId] as const,
    list: (shopId: string | undefined, s: ProductListSearch) =>
        [
            "products",
            shopId,
            s.status ?? "all",
            s.keyword ?? "",
            s.sort ?? "createdAt_desc",
            s.page,
            s.size,
        ] as const,
    detail: (id: string) => ["products", "detail", id] as const,
}

const categoryKeys = {
    tree: ["categories", "tree"] as const,
    specTemplate: (categoryId?: string) => ["categories", "spec-template", categoryId] as const,
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
                status: s.status,
                keyword: s.keyword,
                sort: s.sort,
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

// ---------- 商品详情（列表页编辑弹窗 / 发布页回填共用一份缓存） ----------

/**
 * 店铺商品详情：跳过了就整个不发请求（skipToken），不是「发了再丢掉」。
 *
 * 抽取自两处本地加载（列表页 EditSkuDialog 的 effect、发布页 useProductDraft 的回填 effect）——
 * 同一份服务端数据被两个消费者各自 `useState` 拉一遍，是「两份拷贝 + 各自失效」的形态：
 * 弹窗改完 SKU 后发布页看不到、发布页保存后弹窗里还是旧价格，且两处各写一套 loading/error。
 *
 * 不设 staleTime 覆盖（吃全局 10s 兜底）：这是弹窗与回填的取数口，
 * 写操作后由调用方 invalidate 或 setQueryData 收敛（见 EditSkuDialog 的 update 接线）。
 */
const productDetailOptions = (productId: string | undefined) =>
    queryOptions({
        queryKey: productKeys.detail(productId ?? ""),
        queryFn: productId
            ? () => ProductsAdminApi.getShopProductDetail({ path: { id: productId } })
            : skipToken,
        retry: false,
    })

/** 商品详情（发布页回填 / 编辑弹窗）：无 productId 时不发请求 */
export function useProductDetail(productId: string | undefined) {
    const queryClient = useQueryClient()
    const options = productDetailOptions(productId)
    return {
        ...useQuery(options),
        /** 错误态重试：标脏这一格后由观察者重取（key 从 options 取，不依赖闭包里的 productId） */
        onRetry: () => void queryClient.invalidateQueries({ queryKey: options.queryKey }),
    }
}

// ---------- 类目销售属性模板（发布页两处共用） ----------

/** 类目「销售属性」模板（kind === SPEC）：与类目树同为低频变更公共数据，长缓存 */
const categorySpecTemplateOptions = (categoryId: string | undefined) =>
    queryOptions({
        queryKey: categoryKeys.specTemplate(categoryId),
        queryFn: categoryId
            ? async (): Promise<CategoryAttrNodeResponse[]> => {
                  const nodes = await CategoriesApi.getPublicCategoryAttrTemplate({
                      path: { id: categoryId },
                  })
                  return nodes.filter((n) => n.attr.kind === "SPEC")
              }
            : skipToken,
        staleTime: 10 * 60_000,
    })

/**
 * 类目销售属性模板的共享加载（发布页两处消费：草稿 hook 本地算 SKU 组合、销售信息区渲染编辑器）。
 * 差异只在「要不要把错误显示出来」——统一暴露 error，由使用方决定是否渲染。
 */
export function useCategorySpecTemplate(categoryId: string | undefined) {
    const queryClient = useQueryClient()
    const options = categorySpecTemplateOptions(categoryId)
    const { data, error } = useQuery(options)
    return {
        template: data,
        error: error ? toApiError(error).detail : undefined,
        /** 错误态重试：与其它查询同约定——标脏缓存，由观察者重取（不绕过 staleTime 强打） */
        retry: () => void queryClient.invalidateQueries({ queryKey: options.queryKey }),
    }
}
