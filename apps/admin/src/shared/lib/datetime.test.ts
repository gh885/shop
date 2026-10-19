import { describe, expect, it, vi } from "vite-plus/test"

import { fromDateTimeLocal, toDateTimeLocal } from "./datetime"

// datetime-local 读写的是本地墙上时钟：把时区钉成 Asia/Shanghai 再断言字面量，否则 CI(UTC) 与本机(+08) 各红一半
vi.stubEnv("TZ", "Asia/Shanghai")

describe("datetime-local ↔ ISO", () => {
    it("提交方向把输入框的值按本地时区解释：北京 09:00 上线即 01:00Z", () => {
        expect(fromDateTimeLocal("2026-08-15T09:00")).toBe("2026-08-15T01:00:00.000Z")
    })

    it("空值不提交：没排档期的 banner 不该带上一个 1970 年的时刻", () => {
        expect(fromDateTimeLocal("")).toBeUndefined()
    })

    it("响应没有档期：输入框留空而不是写着 undefined", () => {
        expect(toDateTimeLocal(null)).toBe("")
        expect(toDateTimeLocal(undefined)).toBe("")
    })

    it("回填方向按本地时区显示：后端说北京 09:00 上线，输入框就该写着 09:00", () => {
        expect(toDateTimeLocal("2026-08-15T09:00:00+08:00")).toBe("2026-08-15T09:00")
    })

    it("往返闭合：排好的档期打开再保存一次，不该漂移一个时区差", () => {
        const submitted = fromDateTimeLocal("2026-08-15T09:00")!
        expect(toDateTimeLocal(submitted)).toBe("2026-08-15T09:00")
    })

    it("脏值不当成时刻：解析不出来就留空，别让输入框显示 Invalid Date", () => {
        expect(toDateTimeLocal("not-a-date")).toBe("")
    })
})
