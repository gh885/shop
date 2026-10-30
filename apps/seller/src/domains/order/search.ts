import { z } from "zod"

import { ORDER_STATUSES } from "#/domains/order/constants"

/**
 * 订单列表的 URL 契约。后端是游标分页（商家发新单时 offset 会漏条目），
 * 所以 URL 里是 `cursor` 而不是页码；`size` 是每页条数上限。
 */
export const orderListSearchSchema = z.object({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    status: z.enum(ORDER_STATUSES).optional().catch(undefined),
    cursor: z.string().optional(),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    size: z.coerce.number().int().min(1).max(100).catch(20),
})
export type OrderListSearch = z.infer<typeof orderListSearchSchema>
