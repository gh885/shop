import { describe, expect, it, vi } from "vite-plus/test"

import { formatDate, formatDateTime, formatTimeShort } from "./format"

/**
 * 时间格式化的三条约定：本地时区展示 + 非法值不炸 + 形状由传入的 Locale 决定。
 *
 * 展示的是本地时间（不是 UTC），否则运营在 +08 看到「2026-01-01 00:00」其实是北京 08:00。
 * 所以把时区钉成 Asia/Shanghai 再断言字面量——不钉的话这些用例在 CI（UTC）与本机（+08）会各红一半。
 *
 * 每条都显式给 Locale：`locale` 现在是必填参数（§3.5 约束 2），「这个函数按谁的语言排」必须是
 * 调用点写得出来的事实，而不是运行时某个可变量的当前值。英文形状也在这儿钉住——
 * 以前它根本没法被测（进程级 Locale 一旦为 en-US，中文用例就跟着变红）。
 */
vi.stubEnv("TZ", "Asia/Shanghai")

describe("formatDateTime", () => {
    it("UTC 时刻按本地时区落到当天：跨零点的偏移不能把日期挪走一天", () => {
        expect(formatDateTime("2026-01-01T04:00:00Z", "zh-CN")).toBe("2026-01-01 12:00")
    })

    it("本地时刻原样读：不受时区影响", () => {
        expect(formatDateTime("2026-01-01T12:00:00+08:00", "zh-CN")).toBe("2026-01-01 12:00")
    })

    it("丢秒：展示口径到分钟", () => {
        expect(formatDateTime("2026-01-01T12:00:59+08:00", "zh-CN")).toBe("2026-01-01 12:00")
    })

    it("en-US 用英文月份与 12 小时制：形状跟 Locale 走，不是只换个分隔符", () => {
        expect(formatDateTime("2026-01-01T12:00:00+08:00", "en-US")).toBe("Jan 1, 2026, 12:00 PM")
    })

    it("非法日期原样返回：宁显示脏数据，不显示 Invalid Date", () => {
        expect(formatDateTime("not-a-date", "zh-CN")).toBe("not-a-date")
        expect(formatDateTime("", "zh-CN")).toBe("")
    })
})

describe("formatDate", () => {
    it("只到日：与 formatDateTime 同一条本地时间线", () => {
        expect(formatDate("2026-01-01T04:00:00Z", "zh-CN")).toBe("2026-01-01")
    })

    it("en-US 的日期形状", () => {
        expect(formatDate("2026-01-01T04:00:00Z", "en-US")).toBe("Jan 1, 2026")
    })

    it("非法日期原样返回（和 formatDateTime 同一套兜底）", () => {
        expect(formatDate("oops", "zh-CN")).toBe("oops")
    })
})

describe("formatTimeShort", () => {
    it("月日时分：次要时间占位越小越好", () => {
        expect(formatTimeShort("2026-01-01T12:00:00+08:00", "zh-CN")).toBe("01-01 12:00")
    })

    it("非法/缺省显示「时间未知」：次要位置不值得把 ISO 原文糊上去", () => {
        expect(formatTimeShort("oops", "zh-CN")).toBe("时间未知")
        expect(formatTimeShort("", "zh-CN")).toBe("时间未知")
    })

    it("兜底文案本身也按 Locale 取（走 app-kit catalog，不是硬编码中文）", () => {
        expect(formatTimeShort("oops", "en-US")).toBe("Unknown time")
    })
})
