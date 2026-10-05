import type { CouponTemplateResponse } from "@shop/api/sdk"
import { couponRule } from "@shop/common/domain"
import { type AppLocale } from "@shop/common/i18n"
import { formatDate } from "@shop/app-kit/display"

import { deriveCouponStatus, TEMPLATE_STATUS_META, type CouponRow } from "./model"

/**
 * coupon/mapper —— wire → 领域投影（纯映射，不碰 React / 网络）。
 *
 * 列表展示状态（未开始 / 进行中 / 已结束）的判定在 ./model.ts 的 deriveCouponStatus；
 * 这里只把 wire 的 Money / ISO 时间翻成领域行。
 */

/** 列表一行：wire 的 Money / ISO 时间在这里翻译成展示文案，组件只负责画 */
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
        // 两型通吃：满减给「满 X 减 Y」，折扣给「满 X 打 Z 折，最高减 W」（封顶必进这句话，CPN-65）
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
