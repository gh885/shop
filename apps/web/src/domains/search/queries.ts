import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { ProductsApi } from "@shop/api/sdk"

import { hasSearchCriteria, SEARCH_PAGE_SIZE, searchQueryKey, type SearchParams } from "./search"

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
        staleTime: 30_000,
        placeholderData: keepPreviousData,
        retry: false,
    })
}
