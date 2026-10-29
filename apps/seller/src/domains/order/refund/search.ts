import { z } from "zod"

import { RMA_STATUSES, type RmaStatus } from "#/domains/order/constants"

/** 售后页 URL 筛选契约（search 槽位）：页签即 URL 值，白名单与兜底都在这一处。展示词表在 constants.ts，动作集在 rules 槽位 */

export type RmaTab = RmaStatus | "ALL"

export const DEFAULT_RMA_TAB: RmaTab = "applied"

// URL 筛选值白名单 + 兜底到默认页签：地址栏乱填不会拿到一份"不知怎么筛出来的"列表
// oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
export const RmaTabSchema = z.union([z.enum(RMA_STATUSES), z.literal("ALL")]).catch(DEFAULT_RMA_TAB)

export function rmaTabToStatus(tab: RmaTab): RmaStatus | undefined {
    return tab === "ALL" ? undefined : tab
}

export const rmaListSearchSchema = z.object({
    status: RmaTabSchema,
    cursor: z.string().optional(),
})
