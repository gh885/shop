import { describe, expect, it, vi } from "vite-plus/test"

import { PLATFORM_TIME_ZONE, platformYear } from "./timezone"

/**
 * 平台时区口径。与 app-kit 展示测试同一条纪律：**不钉环境时区，而是让环境时区变**——common 判归属、app-kit 排字符串两模块必须按同一时区读同一 instant，否则会出现「按 UTC 判不同年、按 +08 排出今年」的自相矛盾。
 */
describe("PLATFORM_TIME_ZONE", () => {
    it("一期单一口径：Asia/Shanghai", () => {
        expect(PLATFORM_TIME_ZONE).toBe("Asia/Shanghai")
    })
})

describe("platformYear", () => {
    it("按平台时区读年份：跨年那几小时已经不是环境时区的年份了", () => {
        // 平台时区下这个 instant 是 2026-01-01 01:30，所以年份必须是 2026
        expect(platformYear(new Date("2025-12-31T17:30:00Z"))).toBe(2026)
    })

    it("环境时区不影响结果（与 getFullYear 的分界就在这）", () => {
        const instant = new Date("2025-12-31T17:30:00Z")
        vi.stubEnv("TZ", "UTC")
        const underUtc = platformYear(instant)
        vi.stubEnv("TZ", "Pacific/Kiritimati")
        expect(platformYear(instant)).toBe(underUtc)
    })
})
