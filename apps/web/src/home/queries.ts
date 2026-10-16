import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query"

import { CmsPublicApi, FeedApi, type FeedQuery, type RecommendTabResponse } from "@shop/api/sdk"

import { toProduct, type Product } from "#/products"

const CACHE = 5 * 60_000

export const homeNavOptions = queryOptions({
    queryKey: ["home-nav"],
    queryFn: () => CmsPublicApi.getHomeNav({ query: { navKey: "home" } }),
    staleTime: CACHE,
    retry: false,
})

export const bannersOptions = queryOptions({
    queryKey: ["home-banners"],
    queryFn: () => CmsPublicApi.getHomeBanners({ query: { slot: "home_promo" } }),
    staleTime: CACHE,
    retry: false,
})

export const recommendTabsOptions = queryOptions({
    queryKey: ["home-recommend-tabs"],
    queryFn: () => CmsPublicApi.getRecommendTabs(),
    staleTime: CACHE,
    retry: false,
    throwOnError: false,
})

export function feedCategoryId(tab: RecommendTabResponse | undefined): string | undefined {
    return tab?.targetType === "CATEGORY" ? (tab.target ?? undefined) : undefined
}

export const FEED_PAGE_SIZE = 24

async function fetchFeed(
    input: FeedQuery,
    signal?: AbortSignal,
): Promise<{ items: Product[]; nextCursor: string | null }> {
    const page = await FeedApi.listHomeFeed({
        query: { query: { categoryId: input.categoryId, cursor: input.cursor, size: input.size } },
        signal,
    })
    return { items: page.items.map(toProduct), nextCursor: page.nextCursor }
}

/**
 * <p>切 tab 的「不闪」不在这里：{@code useSuspenseInfiniteQuery} 在实现里硬写了
 * {@code placeholderData: void 0}（suspense 版刻意不吃占位数据），所以「保留上一批卡片」只能靠
 * React 的 transition 完成。
 */
export const feedOptions = (categoryId?: string) =>
    infiniteQueryOptions({
        queryKey: ["home-feed", categoryId ?? "all"],
        queryFn: ({ pageParam, signal }) =>
            fetchFeed({ categoryId, cursor: pageParam, size: FEED_PAGE_SIZE }, signal),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => last.nextCursor ?? undefined,
        select: (data) => {
            const seen = new Set<string>()
            const items: Product[] = []
            for (const page of data.pages) {
                for (const item of page.items) {
                    if (seen.has(item.id)) continue
                    seen.add(item.id)
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
