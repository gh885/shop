import { describe, expect, it } from "vite-plus/test"

import { formatNodeTime } from "./display"

describe("formatNodeTime", () => {
    it("同年只给月日：轴上每条都带年份太吵，而轴内的相对先后已经由顺序表达", () => {
        expect(
            formatNodeTime("2026-07-28T11:12:00+08:00", "zh-Hans-CN", new Date("2026-09-01")),
        ).toBe("07-28 11:12")
    })

    it("跨年补年份：去年 12 月与今年 12 月只给月日在同一条轴上分不开", () => {
        expect(
            formatNodeTime("2025-12-28T11:12:00+08:00", "zh-Hans-CN", new Date("2026-01-05")),
        ).toBe("2025-12-28 11:12")
    })

    it("两种形状都跟着传入的 Locale：英文界面拿到的是英文形状，不是抄来的模式串", () => {
        expect(formatNodeTime("2026-07-28T11:12:00+08:00", "en-US", new Date("2026-09-01"))).toBe(
            "Jul 28, 11:12",
        )
        expect(formatNodeTime("2025-12-28T11:12:00+08:00", "en-US", new Date("2026-01-05"))).toBe(
            "Dec 28, 2025, 11:12 AM",
        )
    })

    it("非法时间原样返回，不显示 Invalid Date", () => {
        expect(formatNodeTime("不是时间", "zh-Hans-CN")).toBe("不是时间")
    })
})
