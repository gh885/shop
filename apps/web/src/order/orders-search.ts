import { z } from "zod"

import type { SearchSchemaInput } from "@tanstack/react-router"

export type OrdersSearch = {
    tab: OrderTab
    page: number
}

const TAB_VALUES = [
    "all",
    "pending_payment",
    "pending_shipment",
    "pending_receipt",
    "completed",
] as const

export type OrderTab = (typeof TAB_VALUES)[number]

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

export function parseOrdersSearch(search: OrdersSearchInput): OrdersSearch {
    return ordersSearchSchema.parse(search)
}
