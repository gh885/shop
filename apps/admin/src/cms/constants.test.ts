import { describe, expect, it, vi } from "vitest"

import {
    blankToUndefined,
    fromDateTimeLocal,
    parseTargetType,
    toDateTimeLocal,
    TARGET_TYPE_ITEMS,
} from "./constants"

/**
 * CMS 三张表单共用的四个小工具：契约里响应字段是宽松的 `string | null`，表单只认收窄后的
 * 枚举，中间这道「脏值不许裸断言进表单」的收口必须只有一份。
 *
 * 时间那两个函数只在本地时区下才有意义（datetime-local 输入框读写的是本地墙上时钟），
 * 所以把时区钉成 Asia/Shanghai 再断言字面量——不钉的话这些用例在 CI（UTC）与本机（+08）会各红一半。
 */
vi.stubEnv("TZ", "Asia/Shanghai")

describe("parseTargetType", () => {
    it("契约给的合法值原样收窄：五种跳转类型都在下拉里", () => {
        expect(parseTargetType("PRODUCT")).toBe("PRODUCT")
        expect(parseTargetType("URL")).toBe("URL")
    })

    it("脏值 / 缺省一律落回 NONE：一个不认识的类型不该让整张表单打不开", () => {
        expect(parseTargetType("MINI_PROGRAM")).toBe("NONE")
        expect(parseTargetType("")).toBe("NONE")
        expect(parseTargetType(null)).toBe("NONE")
        expect(parseTargetType(undefined)).toBe("NONE")
    })

    it("NONE 也在下拉选项里且排第一：默认态是「不跳转」，不是「猜一个」", () => {
        expect(TARGET_TYPE_ITEMS[0]).toEqual({ value: "NONE", label: "不跳转" })
        expect(TARGET_TYPE_ITEMS.map((i) => i.value)).toContain("PRODUCT")
    })
})

describe("blankToUndefined", () => {
    it("空串与全空格都算没填：后端把 null 与缺省一视同仁，前端统一发缺省", () => {
        expect(blankToUndefined("")).toBeUndefined()
        expect(blankToUndefined("   ")).toBeUndefined()
        expect(blankToUndefined(undefined)).toBeUndefined()
    })

    it("有值时顺手去首尾空白：脏空格不该跟着进库", () => {
        expect(blankToUndefined("  12345  ")).toBe("12345")
    })
})

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
