import { describe, expect, it, vi } from "vite-plus/test"

import { formatDate, formatDateTime, formatTimeShort } from "./format"

/** 约定：平台时区恒定 + 形状随 Locale + 非法值不炸（§5.6）。各用例故意让环境 TZ 取 UTC/New_York/Shanghai、断言输出逐条相同——证明与时区无关；旧版只钉死 TZ=Shanghai 反绕过要防的那件事 */
describe("时区无关性（§5.6 的核心保证）", () => {
    /** 跨零点的 instant：UTC 读是 1/1 17:30，上海读是 1/2 01:30 */
    const CROSS_MIDNIGHT = "2026-01-01T17:30:00Z"

    it.each(["UTC", "America/New_York", "Asia/Shanghai", "Pacific/Kiritimati"])(
        "环境时区 %s 下输出一致（都按平台时区 Asia/Shanghai）",
        (tz) => {
            vi.stubEnv("TZ", tz)
            expect(formatDate(CROSS_MIDNIGHT, "zh-Hans-CN")).toBe("2026-01-02")
            expect(formatDateTime(CROSS_MIDNIGHT, "zh-Hans-CN")).toBe("2026-01-02 01:30")
        },
    )

    it("SSR 与客户端同 locale 同输入出同一串文本：两侧环境时区不同也一样", () => {
        vi.stubEnv("TZ", "UTC")
        const serverHtml = formatDateTime(CROSS_MIDNIGHT, "en-US")
        vi.stubEnv("TZ", "Asia/Shanghai")
        const clientHydration = formatDateTime(CROSS_MIDNIGHT, "en-US")
        expect(clientHydration).toBe(serverHtml)
        expect(serverHtml).toBe("Jan 2, 2026, 1:30 AM")
    })
})

describe("formatDateTime", () => {
    it("UTC 时刻按平台时区落到当天：跨零点的偏移不能把日期挪走一天", () => {
        vi.stubEnv("TZ", "UTC")
        expect(formatDateTime("2026-01-01T04:00:00Z", "zh-Hans-CN")).toBe("2026-01-01 12:00")
    })

    it("本地时刻原样读：不受时区影响", () => {
        vi.stubEnv("TZ", "Asia/Shanghai")
        expect(formatDateTime("2026-01-01T12:00:00+08:00", "zh-Hans-CN")).toBe("2026-01-01 12:00")
    })

    it("丢秒：展示口径到分钟", () => {
        expect(formatDateTime("2026-01-01T12:00:59+08:00", "zh-Hans-CN")).toBe("2026-01-01 12:00")
    })

    it("en-US 用英文月份与 12 小时制：形状跟 Locale 走，不是只换个分隔符", () => {
        expect(formatDateTime("2026-01-01T12:00:00+08:00", "en-US")).toBe("Jan 1, 2026, 12:00 PM")
    })

    it("非法日期原样返回：宁显示脏数据，不显示 Invalid Date", () => {
        expect(formatDateTime("not-a-date", "zh-Hans-CN")).toBe("not-a-date")
        expect(formatDateTime("", "zh-Hans-CN")).toBe("")
    })
})

describe("formatDate", () => {
    it("只到日：与 formatDateTime 同一条时间线", () => {
        expect(formatDate("2026-01-01T04:00:00Z", "zh-Hans-CN")).toBe("2026-01-01")
    })

    it("en-US 的日期形状", () => {
        expect(formatDate("2026-01-01T04:00:00Z", "en-US")).toBe("Jan 1, 2026")
    })

    it("非法日期原样返回（和 formatDateTime 同一套兜底）", () => {
        expect(formatDate("oops", "zh-Hans-CN")).toBe("oops")
    })
})

describe("formatTimeShort", () => {
    it("月日时分：次要时间占位越小越好", () => {
        expect(formatTimeShort("2026-01-01T12:00:00+08:00", "zh-Hans-CN")).toBe("01-01 12:00")
    })

    it("非法/缺省显示「时间未知」：次要位置不值得把 ISO 原文糊上去", () => {
        expect(formatTimeShort("oops", "zh-Hans-CN")).toBe("时间未知")
        expect(formatTimeShort("", "zh-Hans-CN")).toBe("时间未知")
    })

    it("兜底文案本身也按 Locale 取（走 app-kit catalog，不是硬编码中文）", () => {
        expect(formatTimeShort("oops", "en-US")).toBe("Unknown time")
    })
})
