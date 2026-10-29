import { z } from "zod"

import { PRODUCT_STATUSES, type ProductStatus } from "#/domains/order/constants"

// status 运行时缺省由 .catch 兜成 "online"，但对外类型保持可选：预链接（<Link search>）只传 {size}、
// hook 也接受不带 status 的搜索，靠这个可选类型 + 路由 validateSearch 的显式标注维持
export type ProductListSearch = {
    status?: ProductStatus
    keyword?: string
    cursor?: string
    size: number
}

export const productListSearchSchema = z.object({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    status: z.enum(PRODUCT_STATUSES).catch("online"),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    keyword: z.string().min(1).optional().catch(undefined),
    cursor: z.string().optional(),
    size: z.coerce.number().int().min(1).max(100).catch(20),
})
