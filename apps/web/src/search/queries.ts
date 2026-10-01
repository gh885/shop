import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { ProductsApi } from "@shop/api/sdk"

import { hasSearchCriteria, SEARCH_PAGE_SIZE, searchQueryKey, type SearchParams } from "./search"

/**
 * 搜索结果查询：阶段 A 直接复用既有买家侧商品列表接口。
 *
 * URL 参数 `q/categoryId/sort/page` 映射到后端 `keyword/categoryId/sort/page/size`；
 * SDK 的 query serializer 会把嵌套对象拍平成 Spring 能绑定的顶层参数。
 */
export function searchProductsOptions(search: SearchParams) {
    const key = searchQueryKey(search)
    return queryOptions({
        queryKey: ["search-products", key.q, key.categoryId, key.sort, key.page] as const,
        queryFn: async ({ signal }) => {
            const page = await ProductsApi.listPublicProducts({
                query: {
                    query: {
                        keyword: key.q,
                        categoryId: key.categoryId,
                        sort: key.sort,
                    },
                    pageParams: { page: key.page, size: SEARCH_PAGE_SIZE },
                },
                signal,
            })
            return page
        },
        enabled: hasSearchCriteria(search),
        // 搜索结果可以有限缓存；分享 URL 不承诺同一时刻完全相同的商品。
        staleTime: 30_000,
        // 改条件/翻页时保留旧结果；旧结果更新中时变暗，不闪空。
        placeholderData: keepPreviousData,
        retry: false,
    })
}
