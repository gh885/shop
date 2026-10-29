import { z } from "zod"

import type { SearchSchemaInput } from "@tanstack/react-router"

import type { MainProgress } from "./order-status"

/**
 * 页签 = 后端展示态（`BuyerOrderQuery.DISPLAY_STATUS`），不是子订单履约态。
 *
 * <p>`closed` 不单列页签：与「已取消」一样只在「全部」里出现——单开一页只服务极少数场景。
 */
export type OrderTab = "all" | Exclude<MainProgress, "closed" | "cancelled">

/**
 * 页签枚举的运行时值：`satisfies readonly OrderTab[]` 保证每个值都是合法页签，
 * 反过来 OrderTab 若新增档位，constants.ts 里 `Record<OrderTab, …>` 会强制补齐。
 */
const TAB_VALUES = [
    "all",
    "pending_payment",
    "paid",
    "partially_refunded",
    "refunded",
] as const satisfies readonly OrderTab[]

export type OrdersSearchInput = SearchSchemaInput & {
    tab?: string
    cursor?: string
}

const ordersSearchSchema = z.object({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise.catch（脏页签收敛到「全部」）
    tab: z.enum(TAB_VALUES).catch("all"),
    cursor: z.string().optional(),
})

/** Output 类型同源于 schema：tab 的具体档位由 TAB_VALUES 决定，不再手写一遍。 */
export type OrdersSearch = z.infer<typeof ordersSearchSchema>

export function parseOrdersSearch(search: OrdersSearchInput): OrdersSearch {
    return ordersSearchSchema.parse(search)
}
