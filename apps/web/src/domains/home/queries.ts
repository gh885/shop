import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query"

import { BuyerCatalogBrowseControllerApi } from "@shop/api/sdk"

import { toProduct, type Product } from "#/domains/products"

const CACHE = 5 * 60_000

/**
 * CMS 模块随重写清空（导航词条 / banner / 推荐位都没有了），首页数据源改为：
 * 类目树（真类目）→ 分类导航词条 + feed 页签；banner 用组件内静态兜底；feed 走目录浏览。
 * 样式与组件结构不动，等 CMS 落回来时只换回数据源。
 */

export const categoryTreeOptions = queryOptions({
    queryKey: ["home-category-tree"],
    queryFn: ({ signal }) => BuyerCatalogBrowseControllerApi.categories({ signal }),
    staleTime: CACHE,
    retry: false,
})

/** feed 页签：全部 + 顶层类目。id 即 feed 的 categoryId（"all" 表示不过滤） */
export type FeedTab = {
    id: string
    /** 运营名（类目名）；"all" 页签没有名字，用 nameKey 走文案 */
    name?: string
    nameKey?: "home.recommend.all"
    isDefault?: boolean
}

export const feedTabsOptions = queryOptions({
    queryKey: ["home-feed-tabs"],
    queryFn: async ({ signal }): Promise<FeedTab[]> => {
        const tree = await BuyerCatalogBrowseControllerApi.categories({ signal })
        return [
            { id: "all", nameKey: "home.recommend.all", isDefault: true },
            ...tree.slice(0, 6).map((node) => ({ id: node.id, name: node.name })),
        ]
    },
    staleTime: CACHE,
    retry: false,
})

export function feedTabCategoryId(tab: FeedTab | undefined): string | undefined {
    return tab === undefined || tab.isDefault ? undefined : tab.id
}

export const FEED_PAGE_SIZE = 24

async function fetchFeed(
    categoryId: string | undefined,
    keyword: string | undefined,
    cursor: string | undefined,
    signal?: AbortSignal,
): Promise<{ items: Product[]; nextCursor: string | null }> {
    const page = await BuyerCatalogBrowseControllerApi.products({
        query: { categoryId, q: keyword || undefined, cursor, limit: FEED_PAGE_SIZE },
        signal,
    })
    return { items: page.items.map(toProduct), nextCursor: page.nextCursor }
}

/**
 * <p>切 tab 的「不闪」不在这里：{@code useSuspenseInfiniteQuery} 在实现里硬写了
 * {@code placeholderData: void 0}（suspense 版刻意不吃占位数据），所以「保留上一批卡片」只能靠
 * React 的 transition 完成。
 */
export const feedOptions = (categoryId?: string, keyword?: string) =>
    infiniteQueryOptions({
        queryKey: ["home-feed", categoryId ?? "all", keyword ?? ""],
        queryFn: ({ pageParam, signal }) => fetchFeed(categoryId, keyword, pageParam, signal),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => last.nextCursor ?? undefined,
        select: (data) => {
            const seen = new Set<string>()
            const items: Product[] = []
            for (const page of data.pages) {
                for (const item of page.items) {
                    if (seen.has(item.spuId)) continue
                    seen.add(item.spuId)
                    items.push(item)
                }
            }
            return { items, pageCount: data.pages.length }
        },
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: false,
    })
