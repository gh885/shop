import type { CouponTemplateResponse } from "@shop/api/sdk"
import { couponRule } from "@shop/common/domain"
import { type AppLocale } from "@shop/i18n"
import { formatDate } from "@shop/app-kit/display"

import { deriveCouponStatus, TEMPLATE_STATUS_META, type CouponRow } from "./model"

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
