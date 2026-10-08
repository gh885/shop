import type { AppLocale } from "../i18n/locale"

/**
 * 计数折万（PRD-68 的算式）：销量、收藏数、评价数是同一个概念——「这个大数怎么念」。
 *
 * 收口前两处各写一份且规则不同：销量只在 ≥1 万折位、整数万去尾（「1万」），
 * 收藏数另有一条 ≥1 千折位且不去尾（「1.2千人收藏」）。两种形状会并排出现在同一张卡片上，
 * 没有理由让一个数在「已售」和「收藏」两栏里长得不一样。
 *
 * **折位交给 `Intl.NumberFormat` 的 `notation: "compact"`，不手写「万」（2026-10-19）**。
 * 旧实现是 `Math.trunc` + `toFixed(1)` + `replace(/\.0$/,"")` + 拼一个「万」字，那重新实现的是
 * `Intl` 已做好的事，且中文单字写死在纯逻辑包里——英文界面会印「1.2万」。
 * 现在 `zh-Hans-CN` 出「1.2万」、`en-US` 出「12K」，折位单位由语言决定。
 *
 * 两个数字口径的取舍（都要显式给，因为 `Intl` 的默认值与产品口径不一致）：
 * - `maximumFractionDigits: 1`——默认的 compact 精度是「按数量级自适应」（12万 / 12.3万 不固定），
 *   PRD-68 要求**一位小数**（`12.3万`），少了精度销量就少了一个量级的可信度；
 * - 输入先 `Math.trunc`——`compactCount(12.9)` 给「12」而不是「13」。计数是整数域，收到小数是脏数据，
 *   截断比四舍五入更贴近「有多少」的语义。
 *
 * **下限不在 `Intl` 的折位里，在这一层**：Intl 对 `1200` 在 zh-Hans-CN 下也给原样（好的），
 * 但不同语言的折位门槛不同，所以「小于 1 万原样」这条产品口径显式钉住，不交给 `Intl` 的语言差异决定。
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

/**
 * 计数折万：`< 1 万` 原样（千位不折，「1.2千」和「1200」在同一条卡片上会打架），
 * `≥ 1 万` 折成一位小数的「x.x万」（中文）/「xK」「x.xK」（英文）。整数万去尾由 `Intl` 负责。
 *
 * 异常数值（NaN / Infinity / 负数 / 小数）给「0」或截断，不把脏值渲染到卡片上。
 */
export function compactCount(count: number, locale: AppLocale): string {
    if (!Number.isFinite(count) || count < 0) return "0"
    const normalized = Math.trunc(count)
    if (normalized < COMPACT_THRESHOLD) return String(normalized)
    return compactFormatter(locale).format(normalized)
}
