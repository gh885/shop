import { describe, expect, it } from "vite-plus/test"
import type { DailySalesResponse } from "@shop/api/sdk"

import { toTrendPoints } from "./daily-sales"

const row = (date: string, fen: number): DailySalesResponse => ({
    date,
    amount: { amount: fen, currency: "CNY" },
})

describe("toTrendPoints：Money（分）→ 图表展示数值（元）", () => {
    it("金额除以 100 换成元，日期截成 MM-DD 短标签", () => {
        expect(toTrendPoints([row("2026-10-15", 5000)])).toEqual([{ label: "10-15", value: 50 }])
    })

    it("空档日的 0 分照画作 0，不退成占位符（0 是真有钱的对立面，不是「没数据」）", () => {
        expect(toTrendPoints([row("2026-10-14", 0)])).toEqual([{ label: "10-14", value: 0 }])
    })

    it("按服务端给的顺序原样映射（补满的 30 天，band 轴从左到右即时间序）", () => {
        const series = toTrendPoints([row("2026-10-13", 1234), row("2026-10-14", 5678)])
        expect(series.map((p) => p.label)).toEqual(["10-13", "10-14"])
        expect(series.map((p) => p.value)).toEqual([12.34, 56.78])
    })

    it("空数组给空点位（防御性：接口未落地时不抛）", () => {
        expect(toTrendPoints([])).toEqual([])
    })
})
