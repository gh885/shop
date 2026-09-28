import { describe, expect, it, vi } from "vite-plus/test"

import { formatDate, formatDateTime, formatTimeShort } from "./format"

/**
 * 时间格式化的两条约定：本地时区展示 + 非法值不炸。
 *
 * 展示的是本地时间（不是 UTC），否则运营在 +08 看到「2026-01-01 00:00」其实是北京 08:00。
 * 所以把时区钉成 Asia/Shanghai 再断言字面量——不钉的话这些用例在 CI（UTC）与本机（+08）会各红一半。
 */
vi.stubEnv("TZ", "Asia/Shanghai")

describe("formatDateTime", () => {
    it("UTC 时刻按本地时区落到当天：跨零点的偏移不能把日期挪走一天", () => {
        expect(formatDateTime("2026-01-01T04:00:00Z")).toBe("2026-01-01 12:00")
    })

    it("本地时刻原样读：不受时区影响", () => {
        expect(formatDateTime("2026-01-01T12:00:00+08:00")).toBe("2026-01-01 12:00")
    })

    it("丢秒：展示口径到分钟", () => {
        expect(formatDateTime("2026-01-01T12:00:59+08:00")).toBe("2026-01-01 12:00")
    })

    it("非法日期原样返回：宁显示脏数据，不显示 Invalid Date", () => {
        expect(formatDateTime("not-a-date")).toBe("not-a-date")
        expect(formatDateTime("")).toBe("")
    })
})

describe("formatDate", () => {
    it("只到日：与 formatDateTime 同一条本地时间线", () => {
        expect(formatDate("2026-01-01T04:00:00Z")).toBe("2026-01-01")
    })

    it("非法日期原样返回（和 formatDateTime 同一套兜底）", () => {
        expect(formatDate("oops")).toBe("oops")
    })
})

describe("formatTimeShort", () => {
    it("月日时分：次要时间占位越小越好", () => {
        expect(formatTimeShort("2026-01-01T12:00:00+08:00")).toBe("01-01 12:00")
    })

    it("非法/缺省显示「时间未知」：次要位置不值得把 ISO 原文糊上去", () => {
        expect(formatTimeShort("oops")).toBe("时间未知")
        expect(formatTimeShort("")).toBe("时间未知")
    })
})
