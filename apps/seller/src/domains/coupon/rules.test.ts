import { describe, expect, it } from "vite-plus/test"

import { deriveCouponStatus } from "./rules"

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
