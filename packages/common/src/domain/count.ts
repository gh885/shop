import type { AppLocale } from "@shop/i18n"

/**
 * 计数折万（PRD-68 的算式）：销量、收藏数、评价数是同一概念，收成一处统一形状（旧两处一个只在 ≥1 万折位、另一个 ≥1 千折不去尾，会并排出现在同一卡片）。折位交给 `Intl.NumberFormat` 的 `notation:"compact"`，单位由语言决定（zh 出「1.2万」、en 出「12K」），不手写「万」。两个口径显式钉住：`maximumFractionDigits:1`（compact 默认按数量级自适应，PRD 要一位小数）；输入先 `Math.trunc`（计数是整数域，截断比四舍五入贴近「有多少」）。「小于 1 万原样」这条产品口径在本层判，不交给 `Intl` 的语言差异决定。
 */
const COMPACT_THRESHOLD = 10000

/** 每个 locale 一个 compact 格式化器（列表里逐行调用，`Intl.NumberFormat` 构造不便宜） */
const compactFormatters = new Map<AppLocale, Intl.NumberFormat>()

function compactFormatter(locale: AppLocale): Intl.NumberFormat {
    const cached = compactFormatters.get(locale)
    if (cached !== undefined) return cached
    const created = new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: 1,
    })
    compactFormatters.set(locale, created)
    return created
}

/** 计数折万：`< 1 万` 原样（千位不折，「1.2千」和「1200」在同一条卡片上会打架），`≥ 1 万` 折成一位小数；异常数值（NaN/Infinity/负数/小数）给「0」或截断，不把脏值渲染到卡片上 */
export function compactCount(count: number, locale: AppLocale): string {
    if (!Number.isFinite(count) || count < 0) return "0"
    const normalized = Math.trunc(count)
    if (normalized < COMPACT_THRESHOLD) return String(normalized)
    return compactFormatter(locale).format(normalized)
}
