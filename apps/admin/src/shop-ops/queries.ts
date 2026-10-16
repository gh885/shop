import { AdminShopsApi, ShopStatus } from "@shop/api/sdk"
import { createPaginationSearchSchema } from "@shop/app-kit/data"
import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"
import { SHOP_KEYWORD_MAX, SHOP_OPS_PAGE_SIZE } from "./constants"

const ShopStatusSchema = z.enum(ShopStatus)

export const shopOpsSearchSchema = createPaginationSearchSchema(SHOP_OPS_PAGE_SIZE).extend({
    status: ShopStatusSchema.optional(),
    keyword: z.string().max(SHOP_KEYWORD_MAX).optional(),
})
export type ShopOpsSearch = z.infer<typeof shopOpsSearchSchema>

export const shopOpsKeys = {
    all: ["admin", "shops"] as const,
    list: (input: ShopOpsSearch) => [...shopOpsKeys.all, input] as const,
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
