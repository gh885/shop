import type { CouponRule } from "@shop/common/domain"
import type { CouponTemplateResponse } from "@shop/api/sdk"
import { couponRule } from "@shop/common/domain"
import { type AppLocale } from "@shop/i18n"
import { formatDate } from "@shop/app-kit/display"

import type { SellerMessageKey } from "#/locales/messages.gen"

import { TEMPLATE_STATUS_META } from "./constants"
import { deriveCouponStatus, type CouponStatus } from "./rules"

/** 本域 wire→视图的唯一出口（mapper 槽位）。判定在 rules.ts，展示词表在 constants.ts，表单契约在 form.ts */

type CouponStatusLabelKey = Extract<SellerMessageKey, `coupon.status.${string}`>

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

export function couponRowFromWire(
    template: CouponTemplateResponse,
    now: number,
    locale: AppLocale,
): CouponRow {
    const status = deriveCouponStatus(template.status, template.validFrom, template.validTo, now)
    const meta = TEMPLATE_STATUS_META[status]

    return {
        id: template.id,
        name: template.name,
        rule: couponRule(template.threshold, template, locale),
        periodText: `${formatDate(template.validFrom, locale)} ~ ${formatDate(template.validTo, locale)}`,
        issuedQuantity: template.issuedQuantity,
        totalQuantity: template.totalQuantity,
        usedQuantity: template.usedQuantity,
        status,
        statusLabelKey: meta.labelKey,
        statusVariant: meta.variant,
        createdAt: template.createdAt,
    }
}
