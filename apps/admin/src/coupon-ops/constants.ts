import { z } from "zod"

import {
    USER_COUPON_STATUSES,
    statusOptionsFromKeys,
    type KeyedStatusOption,
    type UserCouponStatus,
} from "@shop/common/domain"
import { PermissionCodes } from "@shop/common/contract"
import type { AdminMessageKey } from "#/locales/messages.gen"
export const COUPON_OPS_PERMISSION = PermissionCodes.COUPON_OPS

/** 状态筛选值进 URL：取值以 @shop/common 那条码表为准，不在这里再列一遍码 */
export const CouponStatusSchema = z.enum(USER_COUPON_STATUSES)

/** 徽章皮肤：这几个字面量都必须在 ui-web `Badge` 的 variant 里真实存在 */
type OpsBadgeVariant = "success" | "warning" | "secondary" | "destructive-subtle" | "outline"

/**
 * 运营端每个状态该是什么颜色。
 *
 * 颜色与买家端不同不是漂移，是视角差：作废是运营自己做出的动作，列表里必须读成红色；
 * 已过期对买家是中性事实（描边），对运营是已经翻过去的一档（次级底）。
 * 文案不进这张颜色表——它进 catalog（见下方 `OPS_STATUS_LABEL`），§4.1：common 不承载用户可见文案。
 */
const OPS_STATUS_VARIANT = {
    UNUSED: "success",
    LOCKED: "warning",
    USED: "secondary",
    EXPIRED: "secondary",
    VOID: "destructive-subtle",
} as const satisfies Record<UserCouponStatus, OpsBadgeVariant>

/** 状态名的 catalog key 子集：`admin.coupon.status.<码>`，写错键即编译错 */
type CouponStatusKey = Extract<AdminMessageKey, `admin.coupon.status.${string}`>

/**
 * 运营列表的状态名（键）。与买家那句可以逐字相同，但键各指各的 catalog：
 * 一个状态在运营语境下要改措辞（如 VOID「已作废」→「已核销作废」）时不牵动买家页，反之亦然。
 */
const OPS_STATUS_LABEL: Record<UserCouponStatus, CouponStatusKey> = {
    UNUSED: "admin.coupon.status.UNUSED",
    LOCKED: "admin.coupon.status.LOCKED",
    USED: "admin.coupon.status.USED",
    EXPIRED: "admin.coupon.status.EXPIRED",
    VOID: "admin.coupon.status.VOID",
}

/** string 索引视图：列表行的 status 按契约是自由 string，查表得容得下表里没有的码 */
const OPS_VARIANT_BY_KEY: Record<string, OpsBadgeVariant | undefined> = OPS_STATUS_VARIANT
const OPS_LABEL_BY_KEY: Record<string, CouponStatusKey | undefined> = OPS_STATUS_LABEL

/** 运营列表的状态徽章：键与颜色各走自己的表，未知码回退「无键（渲染回调本身）+ 中性描边」 */
export function couponOpsStatusMeta(status: string): {
    labelKey: CouponStatusKey | undefined
    variant: OpsBadgeVariant
} {
    return { labelKey: OPS_LABEL_BY_KEY[status], variant: OPS_VARIANT_BY_KEY[status] ?? "outline" }
}

/** 状态筛选项：五个已知状态全出，顺序即码表里的状态机顺序 */
export const STATUS_OPTIONS: ReadonlyArray<KeyedStatusOption<UserCouponStatus, CouponStatusKey>> =
    statusOptionsFromKeys(OPS_STATUS_LABEL)

/** 来源的 catalog key 子集：`admin.coupon.source.<码>`，写错键即编译错 */
type CouponSourceKey = Extract<AdminMessageKey, `admin.coupon.source.${string}`>

/**
 * 来源列：运营看的是「谁以什么方式拿到这张券」，所以 CLAIM 要说成「用户领取」与运营侧的动作分开。
 *
 * 与状态表同一形态——表里存 key、句子进 catalog（§4.1：common 不承载用户可见文案）；
 * 出参 source 是自由 string，查不到由渲染边界回退显示原码。
 */
export const SOURCE_LABEL: Record<string, CouponSourceKey> = {
    CLAIM: "admin.coupon.source.CLAIM",
    REFUND_RETURN: "admin.coupon.source.REFUND_RETURN",
}
