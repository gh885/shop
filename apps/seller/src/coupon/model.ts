import { z } from "zod"

import type { CouponTemplateResponse } from "@shop/api/sdk"
import { couponRuleText } from "@shop/common"
import { formatDate } from "@shop/app-kit"

/**
 * coupon 域 · 模型层：wire → 领域投影 + 列表展示状态派生。
 *
 * 这里只有纯函数与常量，不含 IO、不含 React——列表状态由后端模板 status 与
 * 有效期区间共同决定，是一条有边界的判定规则，必须能脱离渲染被单测钉住。
 */

// ---------- 列表 URL 状态 ----------

/** 券列表的 URL 状态：页码/每页条数进 URL，可分享可回退（与商品/售后列表同范式） */
export const couponListSearchSchema = z.object({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    page: z.coerce.number().int().min(1).catch(1),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    size: z.coerce.number().int().min(1).catch(10),
})

export type CouponListSearch = z.infer<typeof couponListSearchSchema>

// ---------- 展示状态 ----------

/** 列表展示状态：由模板 status 与有效期区间相对当前时刻派生（不是 wire 里的 status 原样透传） */
export type CouponStatus = "NOT_STARTED" | "ONGOING" | "ENDED" | "STOPPED"

export const COUPON_STATUS_META: Record<
    CouponStatus,
    { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
    NOT_STARTED: { label: "未开始", variant: "outline" },
    ONGOING: { label: "进行中", variant: "default" },
    ENDED: { label: "已结束", variant: "secondary" },
    STOPPED: { label: "已停用", variant: "destructive" },
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

// ---------- wire → 领域投影 ----------

/** 列表一行：wire 的 Money / ISO 时间在这里翻译成展示文案，组件只负责画 */
export interface CouponRow {
    id: string
    name: string
    /** 一句话规则："满 ¥100 减 ¥10" / "无门槛减 ¥10" */
    ruleText: string
    /** 有效期区间："2026-01-01 ~ 2026-02-01" */
    periodText: string
    issuedQuantity: number
    totalQuantity: number
    /** 已核销数：真的被订单用掉的张数（占用中的不算）。与已发放数的差额 = 领了没用掉的那批 */
    usedQuantity: number
    status: CouponStatus
    statusLabel: string
    statusVariant: (typeof COUPON_STATUS_META)[CouponStatus]["variant"]
    createdAt: string
}

export function couponRowFromWire(template: CouponTemplateResponse, now: number): CouponRow {
    const status = deriveCouponStatus(template.status, template.validFrom, template.validTo, now)
    const meta = COUPON_STATUS_META[status]

    return {
        id: template.id,
        name: template.name,
        ruleText: couponRuleText(template.threshold.amount, template.discount.amount),
        periodText: `${formatDate(template.validFrom)} ~ ${formatDate(template.validTo)}`,
        issuedQuantity: template.issuedQuantity,
        totalQuantity: template.totalQuantity,
        usedQuantity: template.usedQuantity,
        status,
        statusLabel: meta.label,
        statusVariant: meta.variant,
        createdAt: template.createdAt,
    }
}
