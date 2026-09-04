/**
 * 金额工具：后端价格字段一律为「分」（Money.amount），表单与展示层用「元」。
 * 与 common.ts 的 MoneySchema 同住一包——金额的形状、换算、展示只有一个真相源。
 */

/** 分 → 元字符串两位小数（如 29900 → "299.00"）；undefined 显示占位符 */
export function fenToYuan(fen: number | undefined, placeholder = "—"): string {
    if (fen === undefined) return placeholder
    return (fen / 100).toFixed(2)
}

/** 分拆成「元整数 + 两位角分」，供价格大字/角分小字的分段排版使用 */
export function splitFen(fen: number): { yuan: string; cents: string } {
    return { yuan: String(Math.floor(fen / 100)), cents: String(fen % 100).padStart(2, "0") }
}

/** 元输入（字符串）→ 分；非法输入返回 undefined 由调用方拦截 */
export function yuanToFen(yuan: string): number | undefined {
    const value = Number(yuan)
    if (!yuan.trim() || Number.isNaN(value) || value < 0) return undefined
    return Math.round(value * 100)
}

/** 价格区间展示（分）：单规格同价时只显示一个价；undefined 视为「未定价」 */
export function priceRangeText(min?: number, max?: number): string {
    if (min === undefined) return "未定价"
    if (max === undefined || max === min) return `¥${fenToYuan(min)}`
    return `¥${fenToYuan(min)} ~ ¥${fenToYuan(max)}`
}
