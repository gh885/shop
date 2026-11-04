import type { Money } from "@shop/api"
import type { AppLocale } from "../contract/locale-vocab.gen"

// Money（分 + 币种）是链路唯一金额形状，「元」只活在输入框与展示文本里；真相源为生成契约（`@shop/api`，此处只 re-export）。两条硬约束同后端 `common/Money.java`：运算不脱离 Money（跨币种抛错）、展示只有一个出口（{@link formatMoney} / 共享 `Price`）。口径见「架构总览」。
export type { Money } from "@shop/api"

/** 平台定价币种（一期只有 CNY）；真上多币种时要与后端入参护栏、DB 的 `CHECK (currency = 'CNY')` 一起改 */
const PLATFORM_CURRENCY = "CNY"

/** 构造 Money：按「分」给数，币种默认平台定价币种 */
export function money(amountFen: number, currency: string = PLATFORM_CURRENCY): Money {
    return { amount: amountFen, currency }
}

/** 零金额：求和的起点。币种由调用方从手上这批钱里拿，不替平台预设 CNY——零也是某个币种的零 */
export function zeroMoney(currency: string = PLATFORM_CURRENCY): Money {
    return money(0, currency)
}

/** 这笔钱是不是「真有钱」（> 0）：账单减项、券门槛、表单面额问的是同一件事；写 `m.amount > 0` 就是把 Money 拆回裸数字比大小 */
export function isPositiveMoney(m: Money): boolean {
    return m.amount > 0
}

/** 相加：仅同币种，跨币种抛错（拿 CNY 的钱加 USD 的钱本身就是错的，静默给个和比报错贵） */
export function plusMoney(a: Money, b: Money): Money {
    assertSameCurrency(a, b)
    const amount = a.amount + b.amount
    if (!Number.isSafeInteger(amount)) throw new Error("金额相加超出安全整数范围")
    return money(amount, a.currency)
}

/** 乘以非负整数倍（单价 × 件数）：结果仍是同币种的钱，单位不漂移 */
export function timesMoney(m: Money, factor: number): Money {
    if (!Number.isSafeInteger(factor) || factor < 0) throw new Error("金额倍数必须是非负安全整数")
    const amount = m.amount * factor
    if (!Number.isSafeInteger(amount)) throw new Error("金额相乘超出安全整数范围")
    return money(amount, m.currency)
}

/** 求和：非空时起点零的币种跟第一笔钱（一叠 USD 不该加出个 CNY 的 0，否则第一轮就抛「币种不一致」）；空集合用调用方显式给的 zero */
export function sumMoney(items: readonly Money[], zero: Money = zeroMoney()): Money {
    if (items.length === 0) return zero
    return items.reduce((acc, item) => plusMoney(acc, item), money(0, items[0]!.currency))
}

function assertSameCurrency(a: Money, b: Money): void {
    if (a.currency !== b.currency) throw new Error("金额币种不一致，无法运算")
}

/** 分 → 元字符串两位小数（如 29900 → "299.00"）；undefined 显示占位符。表单回填与内部换算用，展示走 formatMoney */
export function fenToYuan(fen: number | undefined, placeholder = "—"): string {
    if (fen === undefined) return placeholder
    return (fen / 100).toFixed(2)
}

/** Money → 元字符串两位小数（不含符号、不分组）：输入框回填用 */
export function moneyToYuan(m: Money | null | undefined, placeholder = ""): string {
    return m ? fenToYuan(m.amount) : placeholder
}

/** 元输入（字符串）→ Money；非法输入返回 undefined 由调用方拦截 */
export function yuanToMoney(yuan: string, currency: string = PLATFORM_CURRENCY): Money | undefined {
    const fen = yuanToFen(yuan)
    return fen === undefined ? undefined : money(fen, currency)
}

/** 元输入（字符串）→ 分；非法返回 undefined 由调用方拦截。只认「非负、最多两位小数」：`Number()` 会把 `0x10`/`1e3`/`+5` 也读成数字，对表单来说「格式不正确」才是对的——静默换算是把用户没写过的金额存进库。 */
const YUAN_TEXT = /^\d+(\.\d{1,2})?$/
export function yuanToFen(yuan: string): number | undefined {
    const text = yuan.trim()
    if (!YUAN_TEXT.test(text)) return undefined
    const fen = Math.round(Number(text) * 100)
    return Number.isSafeInteger(fen) ? fen : undefined
}

/** 金额格式化的 Intl.NumberFormat 工厂，按 locale|currency|小数位 缓存（Intl 构造不便宜，列表页逐行调用）。关键口径见「架构总览」：小数位跟本仓库 Money 模型（amount 恒两位小数）而非跟币种——否则 JPY 的 0 位把 1500 分静默渲染成 ¥15。narrowSymbol 让 CNY 在 en-US 下仍是 ¥（默认 symbol 出 CN¥）。真上非 2 位小数币种时这里要连 Money 模型一起数，属 P4。 */
const formatterCache = new Map<string, Intl.NumberFormat>()

function moneyNumberFormat(
    locale: AppLocale,
    currency: string,
    fractionDigits = 2,
): Intl.NumberFormat {
    const cacheKey = `${locale}|${currency}|${fractionDigits}`
    const cached = formatterCache.get(cacheKey)
    if (cached !== undefined) return cached
    const created = new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    })
    formatterCache.set(cacheKey, created)
    return created
}

/** 币种是否被 `Intl` 接受（非 3 字母码如 `CNYX` / `""` 抛 `RangeError`，我们接住）。3 字母的任意形状都算合法——未知币种渲染成「代码 + 数字」（`BTC` → `BTC 1.00`，中间是不换行空格）而非抛错，是 `Intl` 给未知币种的标准退路 */
function isSupportedCurrency(currency: string): boolean {
    try {
        moneyNumberFormat("zh-Hans-CN", currency)
        return true
    } catch {
        return false
    }
}

/** 分 → 元（`Intl` 吃的是元；Money 的单位是分，这一步是唯一的换算） */
const yuanOf = (fen: number): number => fen / 100

/** 按 part 类型取出并拼接；类型集合用 `Set` 判存在而非 `Array.includes`（列表页逐行调用，oxlint `js-set-map-lookups` 就是指这里） */
function joinParts(parts: Intl.NumberFormatPart[], ...types: Intl.NumberFormatPartTypes[]): string {
    const wanted = new Set(types)
    return parts
        .filter((part) => wanted.has(part.type))
        .map((part) => part.value)
        .join("")
}

/** 非法币种的兜底数字：仍走 `Intl` 十进制样式（`style:"decimal"`，带分组），不用 `toFixed` 手搓——否则兜底会退化成「没有千分位」、和主路径不一致 */
function plainNumberFormat(locale: AppLocale, fractionDigits: number): Intl.NumberFormat {
    const cacheKey = `decimal|${locale}|${fractionDigits}`
    const cached = formatterCache.get(cacheKey)
    if (cached !== undefined) return cached
    const created = new Intl.NumberFormat(locale, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    })
    formatterCache.set(cacheKey, created)
    return created
}

/** 金额展示的唯一出口：`{ amount: 29900, currency: "CNY" }` → `"¥299.00"`。缺席（未定价/未退成）显式给占位符，不显示 `¥0.00`——零和「没有数」是两件事。`locale` 必填（§3.5）：`Intl` 靠它定符号位置与数字形状，一期两语输出相同那是当前恰好相同，不是可省参数的理由。 */
export function formatMoney(
    m: Money | null | undefined,
    locale: AppLocale,
    placeholder = "—",
): string {
    if (!m) return placeholder
    return formatMoneyWith(m, locale, 2)
}

/** 按给定小数位格式化一笔钱（内部用）。非法币种退成「代码 + 数字」而非抛——宁可不美也不猜一个错的符号，不是让页面挂掉 */
function formatMoneyWith(m: Money, locale: AppLocale, fractionDigits: number): string {
    if (!isSupportedCurrency(m.currency)) {
        return `${m.currency} ${plainNumberFormat(locale, fractionDigits).format(yuanOf(m.amount))}`
    }
    return moneyNumberFormat(locale, m.currency, fractionDigits).format(yuanOf(m.amount))
}

/** Money 拆成「符号+元整数+两位角分」，供共享 Price 组件分段排版（DESIGN.md §3）。从 Intl.formatToParts 取而非自己拆——分组也由它给。角分保留前导零（.05 的 05）：定宽两格，去零会让价格跳动时抖宽。 */
export function splitMoney(
    m: Money,
    locale: AppLocale,
): { symbol: string; yuan: string; cents: string } {
    const supported = isSupportedCurrency(m.currency)
    const parts = (
        supported ? moneyNumberFormat(locale, m.currency) : plainNumberFormat(locale, 2)
    ).formatToParts(yuanOf(m.amount))
    return {
        symbol: supported ? joinParts(parts, "currency") : `${m.currency} `,
        // 分组分隔符在 `formatToParts` 里是独立的 `group` part，只取 `integer` 会把 `12,345` 读成 `12345`——yuan 要带上 group
        yuan: joinParts(parts, "integer", "group"),
        cents: joinParts(parts, "fraction"),
    }
}
