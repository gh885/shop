import { OrderStatus } from "@shop/api/sdk"
import { paginationSearchSchema } from "@shop/app-kit/data"
import { z } from "zod"

// status 枚举取生成物 OrderStatus：后端加状态时手抄的会漏、URL 筛选值被 .catch 静默吃掉
export const orderListSearchSchema = paginationSearchSchema.extend({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    status: z.enum(OrderStatus).optional().catch(undefined),
})
export type OrderListSearch = z.infer<typeof orderListSearchSchema>
