import type { DailySalesResponse } from "@shop/api/sdk"
import type { TrendPoint } from "@shop/ui-web"

// 这条链路唯一的 Money 变换：/100 把分换成图表展示的元，别去掉
export function toTrendPoints(rows: readonly DailySalesResponse[]): TrendPoint[] {
    return rows.map((row) => ({
        label: row.date.slice(5),
        value: row.amount.amount / 100,
    }))
}
