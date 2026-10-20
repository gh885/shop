import { z } from "zod"

import type { SearchSchemaInput } from "@tanstack/react-router"

import type { MainProgress } from "./order-status"

/**
 * 页签 = 主进度档（docs/domain/order-model.md §5.3），不是子订单状态。
 *
 * <p>`closed` 不单列页签：已关闭的单与已取消的子订单一样只在「全部」里出现——单开一页只服务极少数场景，
 * 却把五个常用页签挤成六个。
 */
export type OrderTab = "all" | Exclude<MainProgress, "closed">

/**
 * 页签枚举的运行时值：`satisfies readonly OrderTab[]` 保证每个值都是合法页签（写错/多写会编译报错），
 * 反过来 OrderTab 若新增档位，constants.ts 里 `Record<OrderTab, …>` 会强制补齐、顺带提醒这里加一项。
 */
const TAB_VALUES = [
    "all",
    "pending_payment",
    "pending_shipment",
    "partially_shipped",
    "pending_receipt",
    "completed",
] as const satisfies readonly OrderTab[]

export type OrdersSearchInput = SearchSchemaInput & {
    tab?: string
    page?: unknown
}

const ordersSearchSchema = z.object({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise.catch（脏页签收敛到「全部」）
    tab: z.enum(TAB_VALUES).catch("all"),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- 同上（脏页码收敛到第 1 页）
    page: z.coerce.number<number>().int().min(1).catch(1),
})

/** Output 类型同源于 schema：tab 的具体档位由 TAB_VALUES 决定，不再手写一遍。 */
export type OrdersSearch = z.infer<typeof ordersSearchSchema>

export function parseOrdersSearch(search: OrdersSearchInput): OrdersSearch {
    return ordersSearchSchema.parse(search)
}
