import type { Money } from "@shop/api"

/**
 * 金额工具：Money（分 + 币种）是链路上唯一的金额形状，「元」只活在输入框与展示文本里。
 *
 * Money 形状的单一真相源是生成契约（@shop/api 的 types.gen Money = { amount, currency }），
 * 这里只 re-export、不手写镜像——契约演进（改字段名/增删）由 pnpm gen:sdk 同步。
 *
 * 两条硬约束，与后端 `common/Money.java` 同一口径：
 * - **运算不脱离 Money**：相加、乘件数、求和的入参与出参都是 Money，跨币种运算抛错而不是静默相加；
 * - **展示只有一个出口**（{@link formatMoney} / 共享 `Price` 组件）：符号由币种决定，
 *   不再各处手写 `¥${fenToYuan(m.amount)}`——那种写法把币种丢了，且每个调用点都是一次拼装。
 *
 * 注：需要 zod 校验原始金额时用 @shop/api 的 zMoney（生成器按契约产出，含 z*Response 嵌套）。
 */
export type { Money } from "@shop/api"

/**
 * 平台定价币种：一期只有 CNY。
 *
 * 前端造 Money（表单提交）时的币种来源，与后端入参护栏、DB 的 `CHECK (currency = 'CNY')` 同一条口径；
 * 真上多币种时这里和那两处要一起数一遍。
 */
const PLATFORM_CURRENCY = "CNY"

const SYMBOLS: Record<string, string> = {
    CNY: "¥",
    USD: "$",
    EUR: "€",
    JPY: "¥",
    HKD: "HK$",
    TWD: "NT$",
}

/** 币种 → 展示符号。未知币种退化成代码本身（宁可不美，也不猜一个错的符号） */
export function currencySymbol(currency: string): string {
    return SYMBOLS[currency] ?? `${currency} `
}

/** 构造 Money：按「分」给数，币种默认平台定价币种 */
export function money(amountFen: number, currency: string = PLATFORM_CURRENCY): Money {
    return { amount: amountFen, currency }
}

/** 零金额：求和的起点。币种由调用方从手上这批钱里拿，不替平台预设 CNY——零也是某个币种的零 */
export function zeroMoney(currency: string = PLATFORM_CURRENCY): Money {
    return money(0, currency)
}

/**
 * 按值比较两笔钱（Money 是值对象：字段全等即同一笔钱）。
 *
 * TS 里 Money 是普通对象，`===` 比的是引用——表单重新解析一遍「12.34」会得到相等但不同引用的 Money，
 * 用 `!==` 判「有没有改动」就会每次都误判成改过。
 */
export function sameMoney(a: Money | null | undefined, b: Money | null | undefined): boolean {
    if (!a || !b) return a === b
    return a.amount === b.amount && a.currency === b.currency
}

/** 相加：仅同币种，跨币种抛错（拿 CNY 的钱加 USD 的钱本身就是错的，静默给个和比报错贵） */
export function plusMoney(a: Money, b: Money): Money {
    assertSameCurrency(a, b)
    return money(a.amount + b.amount, a.currency)
}

/** 乘以非负整数倍（单价 × 件数）：结果仍是同币种的钱，单位不漂移 */
export function timesMoney(m: Money, factor: number): Money {
    if (!Number.isInteger(factor) || factor < 0) throw new Error("金额倍数必须是非负整数")
    return money(m.amount * factor, m.currency)
}

/**
 * 求和：非空时起点零的币种跟着第一笔钱（一叠 USD 不该加出个 CNY 的 0 来当起点，
 * 那会在第一轮就抛「币种不一致」）；空集合没有任何币种可跟，退给调用方显式给的 zero。
 */
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

/** 元输入（字符串）→ 分；非法输入返回 undefined 由调用方拦截 */
export function yuanToFen(yuan: string): number | undefined {
    const value = Number(yuan)
    if (!yuan.trim() || Number.isNaN(value) || value < 0) return undefined
    return Math.round(value * 100)
}

/**
 * 金额展示的唯一出口：`{ amount: 29900, currency: "CNY" }` → `"¥299.00"`。
 *
 * 缺席（未定价 / 未退成）显式给占位符，不显示 `¥0.00`——零和「没有数」是两件事。
 */
export function formatMoney(m: Money | null | undefined, placeholder = "—"): string {
    if (!m) return placeholder
    return `${currencySymbol(m.currency)}${groupYuan(fenToYuan(m.amount))}`
}

/**
 * 元文本加千分位分组（`"12345.67"` → `"12,345.67"`）。
 *
 * 只用于展示：输入框回填不加分隔符，加了就不是可解析的数字。分组规则固定 en-US 风格，
 * 不吃运行机器的区域设置——同一笔钱不该在中文 Windows 与控制台上长得不一样。
 */
export function groupYuan(yuan: string): string {
    const [integer = "", fraction] = yuan.split(".")
    const grouped = integer.replaceAll(/\B(?=(\d{3})+(?!\d))/g, ",")
    return fraction === undefined ? grouped : `${grouped}.${fraction}`
}

/** 分拆成「元整数 + 两位角分」，供价格大字/角分小字的分段排版使用 */
export function splitFen(fen: number): { yuan: string; cents: string } {
    return { yuan: String(Math.floor(fen / 100)), cents: String(fen % 100).padStart(2, "0") }
}

/** Money 拆成「符号 + 元整数 + 两位角分」：共享 Price 组件的分段排版用 */
export function splitMoney(m: Money): { symbol: string; yuan: string; cents: string } {
    const { yuan, cents } = splitFen(m.amount)
    return { symbol: currencySymbol(m.currency), yuan: groupYuan(yuan), cents }
}

/** 价格区间展示：单规格同价时只显示一个价；缺席视为「未定价」 */
export function priceRangeText(min?: Money | null, max?: Money | null): string {
    if (!min) return "未定价"
    if (!max || max.amount === min.amount) return formatMoney(min)
    return `${formatMoney(min)} ~ ${formatMoney(max)}`
}
