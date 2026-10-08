import { describe, expect, it, vi } from "vite-plus/test"

import { formatDate, formatDateTime, formatTimeShort } from "./format"

/**
 * 时间格式化的约定：**平台时区恒定 + 形状由 Locale 决定 + 非法值不炸**。
 *
 * 这里的写法与旧版相反，值得留意：旧版是 `vi.stubEnv("TZ", "Asia/Shanghai")` 然后断言字面量——
 * 那是在**把实现的环境依赖钉死**，恰好绕过了要防的那件事（§5.6）。现在反过来：让环境时区在
 * 不同用例里取 UTC / America/New_York / Asia/Shanghai，断言输出**逐条相同**——输出与时区无关，
 * 这才是「SSR 与 hydration 两侧算同一个 instant 得同一个字符串」要保证的东西。
 *
 * 三条为什么：
 * - 平台时区 `Asia/Shanghai`（`PLATFORM_TIME_ZONE`）：跨零点的 instant 在 UTC 下是 3/1、在 +08 下是 3/2，
 *   SSR 与客户端各按环境时区算就会 hydration 文本不一致（dev 容器 UTC、海外用户浏览器任意）；
 * - 非法日期原样返回，不显示 Invalid Date；
 * - locale 必填（§3.5 约束 2）：「这个函数按谁的语言排」必须是调用点写得出来的事实。
 */
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
