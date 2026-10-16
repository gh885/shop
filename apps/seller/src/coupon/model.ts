import type { CouponRule } from "@shop/common/domain"

import type { SellerMessageKey } from "#/locales/messages.gen"

export type CouponStatus = "NOT_STARTED" | "ONGOING" | "ENDED" | "STOPPED"

type CouponStatusLabelKey = Extract<SellerMessageKey, `coupon.status.${string}`>

// 别和买家券包的 COUPON_STATUS_META「对齐」成一张表：那张说券在买家包的处境，这张说活动跑到哪一段，两套词两个主语
export const TEMPLATE_STATUS_META: Record<
    CouponStatus,
    { labelKey: CouponStatusLabelKey; variant: "success" | "secondary" | "outline" }
> = {
    NOT_STARTED: { labelKey: "coupon.status.NOT_STARTED", variant: "outline" },
    ONGOING: { labelKey: "coupon.status.ONGOING", variant: "success" },
    ENDED: { labelKey: "coupon.status.ENDED", variant: "secondary" },
    // 停用是正常收场不是危险动作：destructive 色按 DESIGN.md 只给破坏性动作，别把徽章「顺手」改成危险色
    STOPPED: { labelKey: "coupon.status.STOPPED", variant: "outline" },
}

// 口径与后端券评估器一致：停用优先于时间窗；起点闭、终点开；时间脏回退 ONGOING，不擅自宣称已作废
export function deriveCouponStatus(
    templateStatus: string,
    validFrom: string,
    validTo: string,
    now: number,
): CouponStatus {
    if (templateStatus === "STOPPED") return "STOPPED"

    const from = Date.parse(validFrom)
    const to = Date.parse(validTo)
    if (Number.isNaN(from) || Number.isNaN(to)) return "ONGOING"

    if (now < from) return "NOT_STARTED"
    if (now >= to) return "ENDED"
    return "ONGOING"
}

export interface CouponRow {
    id: string
    name: string
    rule: CouponRule
    periodText: string
    issuedQuantity: number
    totalQuantity: number
    usedQuantity: number
    status: CouponStatus
    statusLabelKey: CouponStatusLabelKey
    statusVariant: (typeof TEMPLATE_STATUS_META)[CouponStatus]["variant"]
    createdAt: string
}
