import { AdminShopsApi } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"
import type { ShopOpsSearch } from "./search"

export const shopOpsKeys = {
    all: ["shops"] as const,
    list: (input: ShopOpsSearch) => [...shopOpsKeys.all, input] as const,
}

export const adminShopListOptions = (input: ShopOpsSearch) =>
    queryOptions({
        queryKey: shopOpsKeys.list(input),
        queryFn: async ({ signal }) => {
            const page = await AdminShopsApi.listAdminShops({
                query: {
                    pageParams: { page: input.page, size: input.size },
                    query: { status: input.status, keyword: input.keyword },
                },
                signal,
            })
            return { records: page.records, total: page.total }
        },
        placeholderData: (previous) => previous,
    })
