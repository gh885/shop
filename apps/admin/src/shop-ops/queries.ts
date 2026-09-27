import { AdminShopsApi } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"

/** 店铺治理列表的筛选（URL search 形状） */
export type ShopOpsSearch = {
    status?: string
    keyword?: string
    page: number
    size: number
}

export const shopOpsKeys = {
    all: ["admin", "shops"] as const,
    list: (input: ShopOpsSearch) =>
        [
            "admin",
            "shops",
            input.status ?? "",
            input.keyword ?? "",
            input.page,
            input.size,
        ] as const,
}

export const adminShopListOptions = (input: ShopOpsSearch) =>
    queryOptions({
        queryKey: shopOpsKeys.list(input),
        queryFn: async () => {
            const page = await AdminShopsApi.listAdminShops({
                query: {
                    pageParams: { page: input.page, size: input.size },
                    query: { status: input.status, keyword: input.keyword },
                },
            })
            return { records: page.records, total: page.total }
        },
        placeholderData: (previous) => previous,
    })
