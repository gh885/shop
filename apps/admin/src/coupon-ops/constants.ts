import {
    statusOptionsFromKeys,
    type KeyedStatusOption,
    type UserCouponStatus,
} from "@shop/common/domain"
import { PermissionCodes } from "@shop/common/contract"

import type { AdminMessageKey } from "#/locales/messages.gen"

/** 槽位：本域纯数据表（权限码、状态→label key/徽章 variant、来源→label key、statusOptionsFromKeys 派生的筛选选项）。出文案的函数在 display.ts，消费在 columns.tsx / routes */

export const COUPON_OPS_PERMISSION = PermissionCodes.COUPON_OPS

export type OpsBadgeVariant = "success" | "warning" | "secondary" | "destructive-subtle" | "outline"

const OPS_STATUS_VARIANT = {
    UNUSED: "success",
    LOCKED: "warning",
    USED: "secondary",
    EXPIRED: "secondary",
    VOID: "destructive-subtle",
} as const satisfies Record<UserCouponStatus, OpsBadgeVariant>

export type CouponStatusKey = Extract<AdminMessageKey, `coupon.status.${string}`>

const OPS_STATUS_LABEL: Record<UserCouponStatus, CouponStatusKey> = {
    UNUSED: "coupon.status.UNUSED",
    LOCKED: "coupon.status.LOCKED",
    USED: "coupon.status.USED",
    EXPIRED: "coupon.status.EXPIRED",
    VOID: "coupon.status.VOID",
}

// status 收成 string 索引以容纳契约表外的码（→ undefined），别收窄成枚举
export const OPS_VARIANT_BY_KEY: Record<string, OpsBadgeVariant | undefined> = OPS_STATUS_VARIANT
export const OPS_LABEL_BY_KEY: Record<string, CouponStatusKey | undefined> = OPS_STATUS_LABEL

export const STATUS_OPTIONS: ReadonlyArray<KeyedStatusOption<UserCouponStatus, CouponStatusKey>> =
    statusOptionsFromKeys(OPS_STATUS_LABEL)

type CouponSourceKey = Extract<AdminMessageKey, `coupon.source.${string}`>

export const SOURCE_LABEL: Record<string, CouponSourceKey> = {
    CLAIM: "coupon.source.CLAIM",
    REFUND_RETURN: "coupon.source.REFUND_RETURN",
}
