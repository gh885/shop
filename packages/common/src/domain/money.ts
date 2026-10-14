import type { Money } from "@shop/api"
import type { AppLocale } from "@shop/i18n"

/**
 * 金额工具：Money（分 + 币种）是链路上唯一的金额形状，「元」只活在输入框与展示文本里。
 *
 * 形状的单一真相源是生成契约（`@shop/api` 的 types.gen：`{ amount, currency }`），
 * 这里只 re-export、不手写镜像——契约演进由 pnpm sdk:gen 同步。
 * 两条硬约束与后端 `common/Money.java` 同一口径：运算不脱离 Money（相加、乘件数、求和的入参与出参
 * 都是 Money，跨币种抛错而不是静默相加）；展示只有一个出口（{@link formatMoney} / 共享 `Price` 组件，
 * 符号跟币种——各处手写 `¥${fenToYuan(m.amount)}` 等于把币种丢掉）。
 *
 * **展示交给 `Intl.NumberFormat`，不手写符号表与千分位**（2026-10-19）。原来这里是
 * `SYMBOLS` 表 + `groupYuan` 正则两段手写，它们重新实现的是 `Intl` 已经做好的事，且做得更差：
 * 符号位置写死在小数前（`Intl` 按 locale 与币种给）、小数位数写死 2 位（`Intl` 知道 KWD 是 3 位、
 * JPY 是 0 位）、未知币种退化成 `"XYZ "`（`Intl` 直接抛 `RangeError`，我们接住并退成同样形状）。
 * 一期输出逐条不变（见 {@link moneyNumberFormat} 的 `narrowSymbol` 说明），但多币种那天不再要改这里。
 */
export type { Money } from "@shop/api"

/**
 * 平台定价币种：一期只有 CNY。
 *
 * 前端造 Money（表单提交）时的币种来源，与后端入参护栏、DB 的 `CHECK (currency = 'CNY')` 同一条口径；
 * 真上多币种时这里和那两处要一起数一遍。
 */
const PLATFORM_CURRENCY = "CNY"

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

/** 比较两笔钱（-1/0/1）：跨币种抛错，与 {@link plusMoney} 同一口径——不硬比，也不静默给个错的先后 */
export function compareMoney(a: Money, b: Money): number {
    assertSameCurrency(a, b)
    return Math.sign(a.amount - b.amount)
}

/**
 * 这笔钱是不是「真有钱」（> 0）。
 *
 * 几处问的是同一件事：账单里的减项（优惠为 0 不该出现一行「− 优惠 ¥0.00」）、券门槛（0 是
 * 「无门槛」）、表单里的面额。写 `m.amount > 0` 就是把 Money 拆回裸数字比大小。
 */
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

/**
 * 求和：非空时起点零的币种跟着第一笔钱（一叠 USD 不该加出个 CNY 的 0 来当起点，
 * 那会在第一轮就抛「币种不一致」）；空集合没有任何币种可跟，退给调用方显式给的 zero。
 */
export function sumMoney(items: readonly Money[], zero: Money = zeroMoney()): Money {
    if (items.length === 0) return zero
    return items.reduce((acc, item) => plusMoney(acc, item), money(0, items[0]!.currency))
}

/** 一组价里的最低/最高（区间展示的两端）：空集合给 undefined，调用方不必先判长度 */
export function minMoney(items: readonly Money[]): Money | undefined {
    return extremumMoney(items, -1)
}

export function maxMoney(items: readonly Money[]): Money | undefined {
    return extremumMoney(items, 1)
}

function extremumMoney(items: readonly Money[], want: -1 | 1): Money | undefined {
    let best: Money | undefined
    for (const item of items) {
        if (best === undefined || compareMoney(item, best) === want) best = item
    }
    return best
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

/**
 * 元输入（字符串）→ 分；非法输入返回 undefined 由调用方拦截。
 *
 * 只认「非负、最多两位小数」这一种形状：`Number()` 会把 `0x10` / `1e3` / `+5` 也读成数字，
 * 而对表单来说「格式不正确」才是正确答案——静默换算是把用户没写过的金额存进库。
 */
const YUAN_TEXT = /^\d+(\.\d{1,2})?$/
export function yuanToFen(yuan: string): number | undefined {
    const text = yuan.trim()
    if (!YUAN_TEXT.test(text)) return undefined
    const fen = Math.round(Number(text) * 100)
    return Number.isSafeInteger(fen) ? fen : undefined
}

/**
 * 金额的 `Intl.NumberFormat`。四个选项各有一次决策，不是抄 `Intl` 默认值：
 *
 * - `currencyDisplay: "narrowSymbol"`——**保输出不变**。默认的 `symbol` 在 `en-US` 下把 CNY 渲染成
 *   `CN¥299.00`（Intl 为消歧加的 ISO 前缀），那是对今天英文用户可见的行为变更；窄符号下
 *   两种语言都是 `¥299.00`（实测）。真要让英文站显示 `CN¥`，改这一个值即可。
 * - `minimumFractionDigits` / `maximumFractionDigits: 2`——**跟着本仓库的 Money 模型，不跟着币种**。
 *   `Money.amount` 的单位是「分」、恒两位小数（DB 还有 `CHECK (currency = 'CNY')`），所以
 *   「¥15」这种 0 位小数不该由币种决定。若照 `Intl` 默认给 JPY 0 位，我们的 `1500` 分会被静默
 *   渲染成 `¥15`——少两个零的钱看起来还是钱，这是最坏的一类错。
 *   **真上多币种时这里要连Money 模型一起数**（非 2 位小数币种的最小单位是什么），属P4。
 * - 不设 `useGrouping: false`：分组是展示要的（`¥12,345.67`），输入框回填走
 *   {@link moneyToYuan}，那条路不经过这里，所以不需要「关掉分组」这个出口。
 *
 * 缓存：`Intl.NumberFormat` 构造不便宜，而金额格式化在列表页是逐行调用的。按
 * `locale|currency|小数位` 记实例，键空间是「语言 × 币种」这个几十量级的集合。
 */
const formatterCache = new Map<string, Intl.NumberFormat>()

/** 取（并缓存）金额格式化器；`fractionDigits` 供「券面 100.00 要显示成 100」那类按值裁剪的场景用 */
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

/**
 * `Intl` 对非法币种代码抛 `RangeError`（`CNYX` / `""` / `"US"` 都是非法的）。
 *
 * 注意 `Intl` 的「非法」与我们直觉的宽：3 个字母的**任意**形状它都接受，未知币种渲染成
 * 「代码 + 数字」（`BTC` → `BTC 1.00`，中间是不换行空格 U+00A0）而不是抛错。这不是 bug，是它给
 * 未知币种的标准退路；旧手写的 `SYMBOLS` 兜底用普通空格，差这一个字符（不换行更好，认了）。
 * 只有非 3 字母的（`CNYX`）才真的抛，那才是我们要手动兜的一类。
 */
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

/**
 * 按 part 类型取出并拼接。类型集合用 `Set` 判存在而不是 `Array.includes`：
 * `splitMoney` 在列表页是逐行调用的（oxlint 的 `js-set-map-lookups` 就是指这里）。
 */
function joinParts(parts: Intl.NumberFormatPart[], ...types: Intl.NumberFormatPartTypes[]): string {
    const wanted = new Set(types)
    return parts
        .filter((part) => wanted.has(part.type))
        .map((part) => part.value)
        .join("")
}

/**
 * 非法币种的兜底数字：仍然按 locale 分组、仍带货币精度，只是不带币种样式——
 * 走 `Intl.NumberFormat` 的十进制样式（`style:"decimal"`）而不是 `toFixed` 手搓，
 * 否则这条兜底会退化成「没有千分位」，和主路径不一致（那正是这次要消灭的「先格式化再各自加工」）。
 */
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

/**
 * 金额展示的唯一出口：`{ amount: 29900, currency: "CNY" }` → `"¥299.00"`。
 *
 * 缺席（未定价 / 未退成）显式给占位符，不显示 `¥0.00`——零和「没有数」是两件事。
 *
 * `locale` 必填（§3.5 约束 2）：`Intl` 要它才能定符号位置与数字形状，而「按谁的语言排」必须是
 * 调用点写得出来的事实。一期两种语言输出相同，但那是**当前恰好相同**，不是可以省掉这个参数的理由——
 * 省掉就把「不知道当前什么语言」这个状态重新放回来了。
 */
export function formatMoney(
    m: Money | null | undefined,
    locale: AppLocale,
    placeholder = "—",
): string {
    if (!m) return placeholder
    return formatMoneyWith(m, locale, 2)
}

/**
 * 按给定小数位格式化一笔钱（内部用；券面那类「整数不带 `.00`」的场景走
 * {@link compactMoneyText}，不走这里）。
 *
 * 非法币种退成「代码 + 数字」而不是抛：那正是旧 `currencySymbol` 的兜底口径，
 * 兜底的意义是「宁可不美，也不猜一个错的符号」，不是「让页面挂掉」。
 */
function formatMoneyWith(m: Money, locale: AppLocale, fractionDigits: number): string {
    if (!isSupportedCurrency(m.currency)) {
        return `${m.currency} ${plainNumberFormat(locale, fractionDigits).format(yuanOf(m.amount))}`
    }
    return moneyNumberFormat(locale, m.currency, fractionDigits).format(yuanOf(m.amount))
}

/**
 * 「整元语义」的一笔钱的文本（券面：满 100 而不是满 100.00、9.9 而不是 9.90）。
 *
 * 小数位由**值**定，不是恒 2 位也不是恒 0 位：`10000` 分 → 0 位、`990` 分 → 1 位、`1050` 分 → 2 位。
 * 尾零全收掉，但至少留 0 位（不是「至少 1 位」——`100.00` 显示成 `100.0` 是另一种噪声）。
 *
 * 走 `Intl` 的 `fractionDigits` 而不是先格式化再 `replace(/\.00$/,"")`：后者要在**已格式化的字符串**
 * 上做正则与 `slice`，而那正是这次删掉的 `groupYuan` / 老 `couponYuanText` 那类「格式化之后再加工」的
 * 脆弱形状——换 locale 换分组符就崩。这里的「要不要零」是数值判断，该在数字上做。
 */
export function compactMoneyText(m: Money, locale: AppLocale): string {
    const cents = Math.abs(m.amount % 100)
    const fractionDigits = cents === 0 ? 0 : cents % 10 === 0 ? 1 : 2
    return formatMoneyWith(m, locale, fractionDigits)
}

/**
 * Money 拆成「符号 + 元整数 + 两位角分」：共享 `Price` 组件的分段排版用
 * （符号小、元整数大、角分小，DESIGN.md §3）。
 *
 * 从 `Intl` 的 `formatToParts` 取，不自己拆字符串——**分组也是它给的**
 * （`¥12,345.67` 的整数段已经是 `12,345`）。自己 `split` 会退回「先格式化再加工」，而那正是
 * 手写千分位的来路。
 *
 * 角分保留前导零（`.05` 的 `05`）：角分位是定宽的两格，去掉零会让价格在跳动时抖宽。
 */
export function splitMoney(
    m: Money,
    locale: AppLocale,
): { symbol: string; yuan: string; cents: string } {
    const supported = isSupportedCurrency(m.currency)
    // 兜底也走 Intl 的十进制样式拿「带分组的整数 / 角分」，别退回 toFixed+split（那没有分组）
    const parts = (
        supported ? moneyNumberFormat(locale, m.currency) : plainNumberFormat(locale, 2)
    ).formatToParts(yuanOf(m.amount))
    return {
        symbol: supported ? joinParts(parts, "currency") : `${m.currency} `,
        // **要带上 group**：分组分隔符在 `formatToParts` 里是独立的 `group` part，
        // 只取 `integer` 会把 `¥12,345.67` 的整数段读成 `12345`——这个洞正是手写千分位要解决的，
        // 交给 Intl 就别再自己漏掉它（写测试时真漏了一次）
        yuan: joinParts(parts, "integer", "group"),
        cents: joinParts(parts, "fraction"),
    }
}

/** 价格区间展示：单规格同价时只显示一个价；缺席交回 `undefined` 由调用方给占位文案 */
export function priceRangeText(
    min: Money | null | undefined,
    max: Money | null | undefined,
    locale: AppLocale,
): string | undefined {
    if (!min) return undefined
    if (!max || sameMoney(min, max)) return formatMoney(min, locale)
    return `${formatMoney(min, locale)} ~ ${formatMoney(max, locale)}`
}

/**
 * 划线价：只有原价**严格**高于成交价才画。
 *
 * 后端保证 `originalPrice ≥ price`（PRD-39 的前置校验 + DB CHECK），相等是合法数据——但那是
 * 「没让一分钱」，画出来就成了「原价 ¥19.00」压着「¥19.00」，把没让过的钱画成让过的钱。
 * 判据只放这一处：同一个商品在详情页/购物车划线、到订单里不划，用户会以为价格变了。
 * 不可画返回 undefined（把 null 契约值一起归一），调用方直接拿它渲染。
 */
export function strikethroughPrice(
    original: Money | null | undefined,
    price: Money | undefined,
): Money | undefined {
    if (!original || !price) return undefined
    return compareMoney(original, price) > 0 ? original : undefined
}
