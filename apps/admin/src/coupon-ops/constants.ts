import { z } from "zod"

import {
    COUPON_STATUS_META,
    USER_COUPON_STATUSES,
    couponStatusLabel,
    statusOptions,
    type UserCouponStatus,
} from "@shop/common/domain"
import { PermissionCodes } from "@shop/common/contract"
export const COUPON_OPS_PERMISSION = PermissionCodes.COUPON_OPS

/** 状态筛选值进 URL：取值以 @shop/common 那条码表为准，不在这里再列一遍码 */
export const CouponStatusSchema = z.enum(USER_COUPON_STATUSES)

/** 徽章皮肤：这几个字面量都必须在 ui-web `Badge` 的 variant 里真实存在 */
type OpsBadgeVariant = "success" | "warning" | "secondary" | "destructive-subtle" | "outline"

/**
 * 运营端每个状态该是什么颜色。文案不在这里——`couponStatusLabel` 取 @shop/common 那张表，
 * 一个状态只有一句中文；抄第二份的下场是买家页签和运营列表对同一个码说两种话。
 *
 * 颜色与买家端不同也不是漂移，是视角差：作废是运营自己做出的动作，列表里必须读成红色；
 * 已过期对买家是中性事实（描边），对运营是已经翻过去的一档（次级底）。
 */
const OPS_STATUS_VARIANT = {
    UNUSED: "success",
    LOCKED: "warning",
    USED: "secondary",
    EXPIRED: "secondary",
    VOID: "destructive-subtle",
} as const satisfies Record<UserCouponStatus, OpsBadgeVariant>

/** string 索引视图：列表行的 status 按契约是自由 string，查表得容得下表里没有的码 */
const OPS_VARIANT_BY_KEY: Record<string, OpsBadgeVariant | undefined> = OPS_STATUS_VARIANT

/** 运营列表的状态徽章：文案走共享表，颜色走这张，未知码回退中性描边 */
export function couponOpsStatusMeta(status: string): {
    label: string
    variant: OpsBadgeVariant
} {
    return { label: couponStatusLabel(status), variant: OPS_VARIANT_BY_KEY[status] ?? "outline" }
}

/** 状态筛选项：五个已知状态全出，顺序即码表里的状态机顺序 */
export const STATUS_OPTIONS = statusOptions(COUPON_STATUS_META)

/** 来源列：运营看的是「谁以什么方式拿到这张券」，所以 CLAIM 要说成「用户领取」与运营侧的动作分开 */
export const SOURCE_LABEL: Record<string, string> = {
    CLAIM: "用户领取",
    REFUND_RETURN: "退款补发",
}
