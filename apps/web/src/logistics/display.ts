import { isValid } from "date-fns"

import { formatDateTime, formatTimeShort } from "@shop/app-kit/display"
import type { AppLocale } from "@shop/i18n"
import { isSamePlatformYear } from "@shop/i18n"
import type { ShipmentStatus, TrackingNodeCode, TrackingStage } from "@shop/api/sdk"
import type { WebTranslate } from "#/locales/messages.gen"

import { SHIPMENT_STATUS_KEY, TRACKING_NODE_KEY, TRACKING_STAGE_KEY } from "./constants"

/** 本域展示函数的出口：key 表 → 文案、时间 → 展示形状。纯数据在 constants.ts，判定逻辑在 rules.ts */

export function shipmentStatusLabel(status: ShipmentStatus, t: WebTranslate): string {
    return t(SHIPMENT_STATUS_KEY[status])
}

export function trackingStageLabel(stage: TrackingStage, t: WebTranslate): string {
    return t(TRACKING_STAGE_KEY[stage])
}

export function trackingNodeLabel(nodeCode: TrackingNodeCode, t: WebTranslate): string {
    return t(TRACKING_NODE_KEY[nodeCode])
}

/**
 * 判「今年」用 `isSamePlatformYear` 而不是 `d.getFullYear() === now.getFullYear()`：后者读的是**环境**
 * 时区，而下面两条输出按平台时区（`Asia/Shanghai`）排——UTC 机器上「今年」与输出会差一年
 * （12/31 的轨迹节点在 UTC 还算去年、按 +08 排出来却是今年）。
 */
export function formatNodeTime(iso: string, locale: AppLocale, now: Date = new Date()): string {
    const d = new Date(iso)
    if (!isValid(d)) return iso
    return isSamePlatformYear(d, now) ? formatTimeShort(iso, locale) : formatDateTime(iso, locale)
}
