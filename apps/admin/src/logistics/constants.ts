import { PermissionCodes } from "@shop/common"

/** 物流运维页的权限码：后端 `LOGISTICS_MANAGE`（与轨迹维护同权，是同一件事的入口） */
export const LOGISTICS_MANAGE_PERMISSION = PermissionCodes.LOGISTICS_MANAGE

/** 异常类型 → 中文（判据是「该有动静却没有」的三种形态，见 LOG-30~32） */
export const ISSUE_TYPE_LABEL: Record<
    string,
    { label: string; variant: "warning" | "destructive-subtle" }
> = {
    PICKUP_TIMEOUT: { label: "揽收超时", variant: "warning" },
    TRANSIT_STALLED: { label: "中转停滞", variant: "destructive-subtle" },
    DELIVERY_STALLED: { label: "派送停滞", variant: "destructive-subtle" },
}
