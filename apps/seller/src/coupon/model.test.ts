import { describe, expect, it } from "vite-plus/test"

import { makeCouponTemplate } from "@shop/test-utils/fixtures"

import { couponRowFromWire, deriveCouponStatus } from "./model"

/**
 * 券列表展示状态的纯函数测试。
 *
 * 钉住的是「同一张券在列表与结算页不会各说各话」：状态由模板 status + 有效期区间派生，
 * 边界口径与后端 CouponEvaluator 一致（起点闭、终点开）。
 */

const FROM = Date.parse("2026-01-01T12:00:00Z")
const TO = Date.parse("2026-02-01T12:00:00Z")

describe("deriveCouponStatus", () => {
    it("当前时刻早于有效期起点：未开始", () => {
        expect(
            deriveCouponStatus("ACTIVE", "2026-01-01T12:00:00Z", "2026-02-01T12:00:00Z", FROM - 1),
        ).toBe("NOT_STARTED")
    })

    it("当前时刻恰好等于起点：进行中（起点是闭区间，与结算判可用同口径）", () => {
        expect(
            deriveCouponStatus("ACTIVE", "2026-01-01T12:00:00Z", "2026-02-01T12:00:00Z", FROM),
        ).toBe("ONGOING")
    })

    it("当前时刻恰好等于终点：已结束（终点是开区间，过期那一刻起不可用）", () => {
        expect(
            deriveCouponStatus("ACTIVE", "2026-01-01T12:00:00Z", "2026-02-01T12:00:00Z", TO),
        ).toBe("ENDED")
    })

    it("终点前一毫秒：仍然进行中", () => {
        expect(
            deriveCouponStatus("ACTIVE", "2026-01-01T12:00:00Z", "2026-02-01T12:00:00Z", TO - 1),
        ).toBe("ONGOING")
    })

    it("模板已停用：不管时间窗处于哪一段都显示已停用（停发是卖家的动作事实）", () => {
        expect(
            deriveCouponStatus("STOPPED", "2026-01-01T12:00:00Z", "2026-02-01T12:00:00Z", FROM - 1),
        ).toBe("STOPPED")
        expect(
            deriveCouponStatus("STOPPED", "2026-01-01T12:00:00Z", "2026-02-01T12:00:00Z", FROM),
        ).toBe("STOPPED")
        expect(
            deriveCouponStatus("STOPPED", "2026-01-01T12:00:00Z", "2026-02-01T12:00:00Z", TO),
        ).toBe("STOPPED")
    })
})

describe("couponRowFromWire", () => {
    it("满减券：规则文案与有效期区间来自契约的分与 ISO 时间", () => {
        const row = couponRowFromWire(makeCouponTemplate(), FROM, "zh-CN")

        expect(row).toMatchObject({
            name: "新春满减券",
            ruleText: "满 ¥100 减 ¥10",
            periodText: "2026-01-01 ~ 2026-02-01",
            issuedQuantity: 30,
            totalQuantity: 100,
            usedQuantity: 12,
            status: "ONGOING",
            statusLabel: "进行中",
        })
    })

    it("门槛为 0：规则读作无门槛，而不是「满 ¥0」这句废话", () => {
        const row = couponRowFromWire(
            makeCouponTemplate({ threshold: { amount: 0, currency: "CNY" } }),
            FROM,
            "zh-CN",
        )

        expect(row.ruleText).toBe("无门槛减 ¥10")
    })
})
