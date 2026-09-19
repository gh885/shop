import { z } from "zod"

import type { SearchSchemaInput } from "@tanstack/react-router"

/**
 * 我的订单列表的 URL 查询参数 —— 页签与页码是用户摆出来的状态，进 URL 后它就是唯一真源。
 *
 * ## 为什么进 URL 而不是 useState
 * - 刷新、后退、分享链接都不丢当前位置；后退能回到上一个页签/上一页
 * - 与详情页 `?spec=`、结算页 `?lines=` 同一套机制（`validateSearch` + zod + `Route.useSearch()`）
 *
 * 脏值策略与两处先例一致：`?tab=任意乱串` 收敛到「全部」，`?page=0` / `?page=99` 收敛到第 1 页
 * ——脏 URL 不报 500，退化成合法初态。越界页码在数据到达后由页面侧收口（render 时钳制），
 * 这里只拦格式。
 */

/** 订单列表 search：当前页签（默认全部）+ 页码（默认第 1 页） */
export type OrdersSearch = {
    tab: OrderTab
    page: number
}

/** 页签值：四个状态 + all；脏值收敛到 all */
const TAB_VALUES = [
    "all",
    "pending_payment",
    "pending_shipment",
    "pending_receipt",
    "completed",
] as const

export type OrderTab = (typeof TAB_VALUES)[number]

/** validateSearch 的入参类型：带 SearchSchemaInput 标记，让链接可以不带 search 裸跳本页 */
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

/** validateSearch 入口：入参带 SearchSchemaInput 标记，让链接可以不带 search 裸跳本页；脏值各自兜底 */
export function parseOrdersSearch(search: OrdersSearchInput): OrdersSearch {
    return ordersSearchSchema.parse(search)
}

/**
 * 越界页码收口：数据到达后发现页码超出真实总页数（旧链接指向已收缩的列表，
 * 或手输 ?page=99），返回应回到的页码；页码合法时返回 undefined（不需要修 URL）。
 * 纯函数便于单测；调用方只在数据落定后调用，避免用上一页的旧 total 钳新页。
 */
export function outOfRangePage(page: number, totalPages: number): number | undefined {
    if (page <= totalPages) return undefined
    return Math.max(1, totalPages)
}
