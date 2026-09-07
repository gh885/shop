/**
 * 金额工具：后端价格字段一律为「分」（Money.amount），表单与展示层用「元」。
 *
 * Money 形状的单一真相源是生成契约（@shop/api 的 types.gen Money = { amount, currency }），
 * 这里只 re-export、不手写镜像——契约演进（改字段名/增删）由 pnpm gen:sdk 同步。
 * 换算与展示（分↔元）是本文件独有的职责。
 * 注：需要 zod 校验原始金额时用 @shop/api 的 zMoney（生成器按契约产出，含 z*Response 嵌套）；
 * 「金额 ≥ 0」这类契约没表达的领域约束不在手写 schema 里镜像，由后端字段语义兜底。
 */
export type { Money } from "@shop/api"

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
