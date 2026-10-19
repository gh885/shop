import { formatDateTime } from "@shop/app-kit/display"
import { couponRateSlot } from "@shop/app-kit/i18n"
import type { AppLocale } from "@shop/i18n"
import type { CouponFaceValue } from "@shop/common/domain"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"

import type { WebTranslate } from "#/locales/messages.gen"

import {
    COUPON_SOURCE_META,
    COUPON_STATUS_BY_KEY,
    COUPON_STATUS_META,
    COUPON_TAB_ORDER,
    COUPON_UNAVAILABLE_REASON_META,
    type BuyerBadgeVariant,
    type CouponSourceKey,
    type CouponStatusKey,
    type CouponUnavailableReasonKey,
} from "./constants"
import type { CouponTab, MyCoupon } from "./rules"

/** 本域展示函数的出口（display 槽位）：查 constants.ts 的表出文案 key/徽章外观/页签选项，券面大字与时间灰字在这里出字符串。纯数据表在 constants.ts，判定逻辑在 rules.ts（rules 槽位），wire→视图在 mapper.ts */

export function couponStatusMeta(status: string): {
    labelKey: CouponStatusKey | undefined
    variant: BuyerBadgeVariant
} {
    const meta = COUPON_STATUS_BY_KEY[status]
    return { labelKey: meta?.labelKey, variant: meta?.variant ?? "outline" }
}

export function couponSourceKey(source: string): CouponSourceKey | undefined {
    return COUPON_SOURCE_META[source]
}

export function couponUnavailableReasonKey(
    reason: string | null | undefined,
): CouponUnavailableReasonKey | undefined {
    return reason ? COUPON_UNAVAILABLE_REASON_META[reason] : undefined
}

export const COUPON_TABS: ReadonlyArray<KeyedStatusOption<CouponTab, CouponStatusKey>> =
    statusOptionsFromKeys<CouponTab, CouponStatusKey>(COUPON_STATUS_META, COUPON_TAB_ORDER)

/**
 * 券面大字：买家单端展示，不跨端重复，故保留 web 本地（face.rate 是 web 本地 key）；
 * 折扣档算法与规则句共用 app-kit 的 couponRateSlot，规则句本体走 couponRuleText。
 */
export function couponFaceText(value: CouponFaceValue, locale: AppLocale, t: WebTranslate): string {
    if (value === undefined) return "—"
    if (value.kind === "money") return value.text
    return t("coupon.face.rate", { rate: couponRateSlot(value.rate, locale) })
}

export type CouponTimeReasonHint =
    | { key: "coupon.reason.notEffective"; datetime: string }
    | { key: "coupon.reason.expired" }

/** 哪些状态还需要一句时间灰字是判定（coupon.ts 里 status 已是视图口径），这里的职责是把时间按 locale 排成字符串 */
export function couponTimeReasonHint(
    coupon: MyCoupon,
    locale: AppLocale,
): CouponTimeReasonHint | undefined {
    if (coupon.status !== "UNUSED" && coupon.status !== "LOCKED") return undefined
    switch (coupon.unavailableReason) {
        case "NOT_EFFECTIVE":
            return {
                key: "coupon.reason.notEffective",
                datetime: formatDateTime(coupon.effectiveAt, locale),
            }
        case "EXPIRED":
            return { key: "coupon.reason.expired" }
        default:
            return undefined
    }
}
