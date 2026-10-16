import { PermissionCodes } from "@shop/common/contract"

import type { AdminMessageKey } from "#/locales/messages.gen"

export const LOGISTICS_MANAGE_PERMISSION = PermissionCodes.LOGISTICS_MANAGE

type IssueTypeKey = Extract<AdminMessageKey, `logistics.issue.${string}`>

export const ISSUE_TYPE_LABEL: Record<
    string,
    { labelKey: IssueTypeKey; variant: "warning" | "destructive-subtle" }
> = {
    PICKUP_TIMEOUT: { labelKey: "logistics.issue.PICKUP_TIMEOUT", variant: "warning" },
    TRANSIT_STALLED: {
        labelKey: "logistics.issue.TRANSIT_STALLED",
        variant: "destructive-subtle",
    },
    DELIVERY_STALLED: {
        labelKey: "logistics.issue.DELIVERY_STALLED",
        variant: "destructive-subtle",
    },
}
