import { PermissionCodes } from "@shop/common/contract"

import type { AdminMessageKey } from "#/locales/messages.gen"

/** 物流运维页的权限码：后端 `LOGISTICS_MANAGE`（与轨迹维护同权，是同一件事的入口） */
export const LOGISTICS_MANAGE_PERMISSION = PermissionCodes.LOGISTICS_MANAGE

/** 异常类型的 catalog key 子集：`admin.logistics.issue.<码>`，写错键即编译错 */
type IssueTypeKey = Extract<AdminMessageKey, `admin.logistics.issue.${string}`>

/**
 * 异常类型 → key + 徽章色（判据是「该有动静却没有」的三种形态，见 LOG-30~32）。
 *
 * 表里存 key、句子进 catalog；出参 type 是自由 string，查不到由渲染边界回退显示原码 + 中性色。
 */
export const ISSUE_TYPE_LABEL: Record<
    string,
    { labelKey: IssueTypeKey; variant: "warning" | "destructive-subtle" }
> = {
    PICKUP_TIMEOUT: { labelKey: "admin.logistics.issue.PICKUP_TIMEOUT", variant: "warning" },
    TRANSIT_STALLED: {
        labelKey: "admin.logistics.issue.TRANSIT_STALLED",
        variant: "destructive-subtle",
    },
    DELIVERY_STALLED: {
        labelKey: "admin.logistics.issue.DELIVERY_STALLED",
        variant: "destructive-subtle",
    },
}
