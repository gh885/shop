import { describe, expect, it, vi } from "vite-plus/test"

import { PLATFORM_TIME_ZONE, isSamePlatformYear } from "./timezone"

/**
 * 平台时区口径。
 *
 * 与 app-kit 的展示测试同一条纪律：**不钉环境时区，而是让环境时区变**。这两个模块（common 判归属、
 * app-kit 排字符串）必须按同一个时区读同一个 instant，否则会出现「按 UTC 判不是同年、按 +08 排出来
 * 却是今年」这种自相矛盾——那正是 `isSamePlatformYear` 存在的理由。
 */
describe("PLATFORM_TIME_ZONE", () => {
    it("一期单一口径：Asia/Shanghai", () => {
        expect(PLATFORM_TIME_ZONE).toBe("Asia/Shanghai")
    })
})

describe("isSamePlatformYear", () => {
    it("跨年判定按平台时区：12/31 的节点在 UTC 机器上也算新的一年", () => {
        vi.stubEnv("TZ", "UTC")
        const newYearNode = new Date("2025-12-31T17:30:00Z") // 平台时区 = 2026-01-01 01:30
        const reference = new Date("2026-01-02T04:00:00+08:00")
        // 环境时区（UTC）下前者是 2025 年、后者是 2026 年 → 旧写法（getFullYear）会判 false，
        // 于是同一条轨迹节点被排成完整时间而不是短时间
        expect(newYearNode.getUTCFullYear()).toBe(2025)
        expect(isSamePlatformYear(newYearNode, reference)).toBe(true)
    })

    it("确实跨年时判 false", () => {
        expect(
            isSamePlatformYear(
                new Date("2025-06-01T04:00:00Z"),
                new Date("2026-01-02T04:00:00+08:00"),
            ),
        ).toBe(false)
    })

    it("环境时区不影响判定（平台时区读出来的年份与进程时区无关）", () => {
        const node = new Date("2025-12-31T17:30:00Z")
        const reference = new Date("2026-01-02T04:00:00+08:00")
        vi.stubEnv("TZ", "UTC")
        const underUtc = isSamePlatformYear(node, reference)
        vi.stubEnv("TZ", "Pacific/Kiritimati")
        expect(isSamePlatformYear(node, reference)).toBe(underUtc)
    })
})
