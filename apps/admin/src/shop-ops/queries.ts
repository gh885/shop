import { AdminShopsApi, ShopStatus } from "@shop/api/sdk"
import { createPaginationSearchSchema } from "@shop/app-kit/data"
import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"
import { SHOP_KEYWORD_MAX, SHOP_OPS_PAGE_SIZE } from "./constants"

/**
 * 状态筛选的合法取值：契约 `ShopStatus` 是唯一出处。它只有一个读者（下面那份 search schema），
 * 所以住在这里，不进 `constants.ts`——那个文件按约定只放展示常量（文案 / 色板 / 动作表 / 页签）。
 *
 * 此前这里是 `z.string().max(32)`，那个 32 只在测试里与审计的 `TARGET_TYPE_MAX` 绑在一起核对——
 * 两个无关概念因为「恰好都是 32」被焊住：改审计规则会要求店铺筛选跟着改，而店铺枚举真变了它未必发现。
 * 换成枚举后长度上限这一格消失，合法性直接由契约枚举给（account 域的 `UserStatus` / `StaffStatus` 同此形）。
 */
const ShopStatusSchema = z.enum(ShopStatus)

/** 店铺治理列表的筛选（URL search 形状） */
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
