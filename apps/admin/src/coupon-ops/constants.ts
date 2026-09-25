import { statusOptions, PermissionCodes } from "@shop/common"
import { z } from "zod"

export const COUPON_OPS_PERMISSION = PermissionCodes.COUPON_OPS
export const CouponStatusSchema = z.enum(["UNUSED", "LOCKED", "USED", "EXPIRED", "VOID"])
export type AdminCouponStatus = z.infer<typeof CouponStatusSchema>

export const STATUS_META = {
    UNUSED: { label: "未使用", variant: "success" },
    LOCKED: { label: "结算中", variant: "warning" },
    USED: { label: "已使用", variant: "secondary" },
    EXPIRED: { label: "已过期", variant: "secondary" },
    VOID: { label: "已作废", variant: "destructive-subtle" },
} as const satisfies Record<
    AdminCouponStatus,
    { label: string; variant: "success" | "warning" | "secondary" | "destructive-subtle" }
>

export const STATUS_OPTIONS = statusOptions(STATUS_META)

export const SOURCE_LABEL: Record<string, string> = {
    CLAIM: "用户领取",
    REFUND_RETURN: "退款补发",
}
