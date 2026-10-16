import {
    statusOptionsFromKeys,
    type KeyedStatusOption,
    type UserCouponStatus,
} from "@shop/common/domain"
import { PermissionCodes } from "@shop/common/contract"
import type { AdminMessageKey } from "#/locales/messages.gen"
export const COUPON_OPS_PERMISSION = PermissionCodes.COUPON_OPS

type OpsBadgeVariant = "success" | "warning" | "secondary" | "destructive-subtle" | "outline"

const OPS_STATUS_VARIANT = {
    UNUSED: "success",
    LOCKED: "warning",
    USED: "secondary",
    EXPIRED: "secondary",
    VOID: "destructive-subtle",
} as const satisfies Record<UserCouponStatus, OpsBadgeVariant>

type CouponStatusKey = Extract<AdminMessageKey, `coupon.status.${string}`>

const OPS_STATUS_LABEL: Record<UserCouponStatus, CouponStatusKey> = {
    UNUSED: "coupon.status.UNUSED",
    LOCKED: "coupon.status.LOCKED",
    USED: "coupon.status.USED",
    EXPIRED: "coupon.status.EXPIRED",
    VOID: "coupon.status.VOID",
}

// status 收成 string 索引以容纳契约表外的码（→ undefined），别收窄成枚举
const OPS_VARIANT_BY_KEY: Record<string, OpsBadgeVariant | undefined> = OPS_STATUS_VARIANT
const OPS_LABEL_BY_KEY: Record<string, CouponStatusKey | undefined> = OPS_STATUS_LABEL

export function couponOpsStatusMeta(status: string): {
    labelKey: CouponStatusKey | undefined
    variant: OpsBadgeVariant
} {
    return { labelKey: OPS_LABEL_BY_KEY[status], variant: OPS_VARIANT_BY_KEY[status] ?? "outline" }
}

export const STATUS_OPTIONS: ReadonlyArray<KeyedStatusOption<UserCouponStatus, CouponStatusKey>> =
    statusOptionsFromKeys(OPS_STATUS_LABEL)

type CouponSourceKey = Extract<AdminMessageKey, `coupon.source.${string}`>

export const SOURCE_LABEL: Record<string, CouponSourceKey> = {
    CLAIM: "coupon.source.CLAIM",
    REFUND_RETURN: "coupon.source.REFUND_RETURN",
}
