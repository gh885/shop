import { describe, expect, it } from "vite-plus/test"

import {
    composeWallClock,
    formatWallClockDisplay,
    formatWallClockTime,
    parseWallClock,
} from "./wall-clock"

/** 钉住读写两侧都按本地时区走：回填一旦改走 UTC（toISOString 那类），每次「打开并保存」就前挪一个时区差，界面看不出、数据已跑 */

/** 2026-03-05 09:05:07.500，本地时区（用例只比墙上时钟分量，与机器时区无关） */
const LOCAL_DATE = new Date(2026, 2, 5, 9, 5, 7, 500)

/** 读回类用例走这里：读不回来就当场炸，而不是把 undefined 塞进后面的比较 */
function dateOf(value: string): Date {
    const parsed = parseWallClock(value)
    if (!parsed) throw new Error(`期望能读回，实际是 undefined：${value}`)
    return parsed
}

describe("parseWallClock", () => {
    it("空串与「有字但不是日期」都算没选", () => {
        expect(parseWallClock("")).toBeUndefined()
        expect(parseWallClock("   ")).toBeUndefined()
        expect(parseWallClock("2026-13-45T99:99")).toBeUndefined()
    })

    it("合法值按本地时区解释：读回的就是写出去的那几个分量", () => {
        const parsed = dateOf("2026-03-05T09:05")

        expect(parsed.getFullYear()).toBe(2026)
        expect(parsed.getMonth()).toBe(2)
        expect(parsed.getDate()).toBe(5)
        expect(parsed.getHours()).toBe(9)
        expect(parsed.getMinutes()).toBe(5)
    })
})

describe("composeWallClock", () => {
    it("产出 WALL_CLOCK 形状：不带时区偏移，也不带秒位", () => {
        const composed = composeWallClock(LOCAL_DATE, "18:30")

        expect(composed).toBe("2026-03-05T18:30")
        expect(composed).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    })

    it("时分为空或不是数字时按 0 点收，秒与毫秒一律清零", () => {
        // 07 秒 / 500 毫秒是 LOCAL_DATE 自带的：控件只到分，留着旧秒位会让同一分钟两次保存写出两个值
        expect(composeWallClock(LOCAL_DATE, "")).toBe("2026-03-05T00:00")
        expect(composeWallClock(LOCAL_DATE, "abc")).toBe("2026-03-05T00:00")
        expect(composeWallClock(LOCAL_DATE, "09")).toBe("2026-03-05T09:00")
    })

    it("只选日不选时（沿用已有时分）不会把时间归到 00:00", () => {
        expect(composeWallClock(dateOf("2026-03-06T23:59"), "23:59")).toBe("2026-03-06T23:59")
    })

    it("不改传入的 Date：它同时是日历的 selected，被改就脏了", () => {
        const before = LOCAL_DATE.getTime()

        composeWallClock(LOCAL_DATE, "00:00")

        expect(LOCAL_DATE.getTime()).toBe(before)
    })

    it("写出再读回是原值：这一条就是「别走 UTC」的守卫", () => {
        const parsed = dateOf(composeWallClock(LOCAL_DATE, "09:05"))

        expect(formatWallClockTime(parsed)).toBe("09:05")
        expect(formatWallClockDisplay(parsed, "zh-Hans-CN")).toBe("2026-03-05 09:05")
    })
})

describe("formatWallClockTime / formatWallClockDisplay", () => {
    it("时分补零到两位（输入框读写的形状）", () => {
        expect(formatWallClockTime(new Date(2026, 0, 1, 7, 3))).toBe("07:03")
    })

    it("展示形状跟 Locale 走，存的值不变", () => {
        expect(formatWallClockDisplay(LOCAL_DATE, "zh-Hans-CN")).toBe("2026-03-05 09:05")
        expect(formatWallClockDisplay(LOCAL_DATE, "en-US")).toBe("Mar 5, 2026, 9:05 AM")
    })
})
