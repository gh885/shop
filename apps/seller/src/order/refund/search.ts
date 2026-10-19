import { z } from "zod"

import { paginationSearchSchema } from "@shop/app-kit/data"
import { RefundStatus } from "@shop/api/sdk"

/** 退款页 URL 筛选契约（search 槽位）：页签即 URL 值，白名单与兜底都在这一处。展示词表在 constants.ts，行内动作视图在 mapper.ts，判定在 rules 槽位（本页签无独立判定，不另立文件） */

export type RefundTab = (typeof RefundStatus)[keyof typeof RefundStatus] | "ALL"

export const DEFAULT_REFUND_TAB: RefundTab = "PENDING"

// URL 筛选值白名单 + 兜底到默认页签：地址栏乱填不会拿到一份"不知怎么筛出来的"列表
// oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
export const RefundTabSchema = z
    .union([z.enum(RefundStatus), z.literal("ALL")])
    .catch(DEFAULT_REFUND_TAB)

export function refundTabToStatus(tab: RefundTab) {
    return tab === "ALL" ? undefined : tab
}

export const refundListSearchSchema = paginationSearchSchema.extend({ status: RefundTabSchema })
