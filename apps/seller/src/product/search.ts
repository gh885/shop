import { ProductStatus } from "@shop/api/sdk"
import { paginationSearchSchema } from "@shop/app-kit/data"
import { z } from "zod"

import { PRODUCT_SORTS, type ProductSort } from "./queries"

// status 运行时缺省由 .catch 兜成 PUBLISHED，但对外类型保持可选：预链接（<Link search>）只传 {page,size}、
// hook 也接受不带 status 的搜索，靠这个可选类型 + 路由 validateSearch 的显式标注维持（z.infer 表达不了「输入可选、输出有值」两套）
export type ProductListSearch = {
    status?: ProductStatus
    keyword?: string
    sort?: ProductSort
    page: number
    size: number
}

export const productListSearchSchema = paginationSearchSchema.extend({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    status: z.enum(ProductStatus).catch("PUBLISHED"),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    keyword: z.string().min(1).optional().catch(undefined),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    sort: z.enum(PRODUCT_SORTS).optional().catch(undefined),
})
