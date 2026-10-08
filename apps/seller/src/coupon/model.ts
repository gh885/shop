import type { CouponRule } from "@shop/common/domain"

/**
 * coupon 域 · 模型层：业务类型 + 列表展示状态派生（wire → 投影在 ./mapper.ts）。
 *
 * 这里只有纯函数与常量，不含 IO、不含 React——列表状态由后端模板 status 与
 * 有效期区间共同决定，是一条有边界的判定规则，必须能脱离渲染被单测钉住。
 */

import type { SellerMessageKey } from "#/locales/messages.gen"

// 展示状态
/** 列表展示状态：由模板 status 与有效期区间相对当前时刻派生（不是 wire 里的 status 原样透传） */
export type CouponStatus = "NOT_STARTED" | "ONGOING" | "ENDED" | "STOPPED"

/**
 * 券**活动**状态：文案与徽章色同表一处。
 *
 * 它与买家券包那张 `COUPON_STATUS_META`（@shop/common，未使用/结算中/已使用/已过期/已作废）
 * 不是一张表的两个副本：那张说的是「这张券在买家包里的处境」，这张说的是「这个活动跑到哪一段」，
 * 两套词、两个主语（合并只会有一方读另一方的话）。名字也刻意错开，免得下一个人来「对齐」这两张表。
 */
/** 券活动状态名的 catalog key 子集：`coupon.status.<码>`，写错键即编译错 */
type CouponStatusLabelKey = Extract<SellerMessageKey, `coupon.status.${string}`>

/**
 * 券**活动**状态：句（键）与徽章色同表一处——文案归 seller catalog，本纯层只发 key，
 * 句子由渲染点（CouponTable）用 t() 换（§6：纯层发事实、渲染层成句）。
 *
 * 它与买家券包那张 `COUPON_STATUS_META`（@shop/common，未使用/结算中/已使用/已过期/已作废）
 * 不是一张表的两个副本：那张说的是「这张券在买家包里的处境」，这张说的是「这个活动跑到哪一段」，
 * 两套词、两个主语（合并只会有一方读另一方的话）。名字也刻意错开，免得下一个人来「对齐」这两张表。
 */
export const TEMPLATE_STATUS_META: Record<
    CouponStatus,
    { labelKey: CouponStatusLabelKey; variant: "success" | "secondary" | "outline" }
> = {
    NOT_STARTED: { labelKey: "coupon.status.NOT_STARTED", variant: "outline" },
    ONGOING: { labelKey: "coupon.status.ONGOING", variant: "success" },
    ENDED: { labelKey: "coupon.status.ENDED", variant: "secondary" },
    // 「已停用」是活动跑完了另一种收场，不是一条危险操作：destructive（危险色）按
    // DESIGN.md §2.2 只给破坏性动作与错误。停用与结束的区别由「实心 vs 空心」两档中性表达，
    // 危险色留给真正下刀的那个「停用」按钮本身。
    STOPPED: { labelKey: "coupon.status.STOPPED", variant: "outline" },
}

/**
 * 模板 status + 有效期区间 + 当前时刻 → 展示状态。
 *
 * 判定次序与后端券评估器一致（可用性以绝对时间为准）：
 * 1. 已停用优先——停用是卖家的动作事实，哪怕时间窗还没开始，"不再发放"也比"未开始"更该被看见；
 * 2. 起点闭区间、终点开区间（`validFrom <= now < validTo`），与 `CouponEvaluator` 的
 *    `!now.isBefore(expireAt)` 同口径，避免列表说"进行中"而结算说"已过期"。
 *
 * 时间无法解析时回退「进行中」而不是「已结束」：契约保证是 OffsetDateTime，
 * 真出现脏值时最保守的展示是不主动宣称这张券已经作废。
 */
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

// 列表行（领域形状）
/** 列表一行（领域形状）：金额 / 时间已在投影层翻成展示文案，组件只负责画 */
export interface CouponRow {
    id: string
    name: string
    /** 一句话规则："满 ¥100 减 ¥10" / "无门槛减 ¥10" */
    /** 规则句的**结构化事实**（不是句子）：句子由 CouponTable 用 t() 出——common 不承载文案 */
    rule: CouponRule
    /** 有效期区间："2026-01-01 ~ 2026-02-01" */
    periodText: string
    issuedQuantity: number
    totalQuantity: number
    /** 已核销数：真的被订单用掉的张数（占用中的不算）。与已发放数的差额 = 领了没用掉的那批 */
    usedQuantity: number
    status: CouponStatus
    statusLabelKey: CouponStatusLabelKey
    statusVariant: (typeof TEMPLATE_STATUS_META)[CouponStatus]["variant"]
    createdAt: string
}
