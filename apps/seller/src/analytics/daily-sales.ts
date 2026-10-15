import type { DailySalesResponse } from "@shop/api/sdk"
import type { TrendPoint } from "@shop/ui-web"

/**
 * 每日销售额 → 折线图点位（这条链路上唯一真实的 Money 变换）：
 * - 金额：Money 的单位是分，图表 y 轴收「展示数值」元，`/100` 在这里换算；符号与币种属文案层（tooltip 在收尾接 i18n/formatMoney）
 * - 日期："YYYY-MM-DD" → "MM-DD" 短标签（band 轴 30 格放不下全日期，年份对「近 30 天」无信息量）
 */
export function toTrendPoints(rows: readonly DailySalesResponse[]): TrendPoint[] {
    return rows.map((row) => ({
        label: row.date.slice(5),
        value: row.amount.amount / 100,
    }))
}
