import { describe, expect, it } from "vite-plus/test"

import {
    blankToUndefined,
    CmsTargetSortSchema,
    parseTargetType,
    targetSortDefaults,
    toTargetSortFields,
} from "./form"

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

describe("跳转 + 排序公共片段", () => {
    it("回填：响应行按 parse/提交的反向折成表单初值，脏 targetType 落回 NONE", () => {
        expect(
            targetSortDefaults({ targetType: "CATEGORY", target: "shoes", sortOrder: 12 }),
        ).toEqual({ targetType: "CATEGORY", target: "shoes", sortOrder: "12" })
        expect(targetSortDefaults({ targetType: "MINI_PROGRAM", target: null })).toEqual({
            targetType: "NONE",
            target: "",
            sortOrder: "0",
        })
        expect(targetSortDefaults()).toEqual({ targetType: "NONE", target: "", sortOrder: "0" })
    })

    it("提交：NONE 与空目标都折成缺省，排序空串按 0 发", () => {
        expect(toTargetSortFields({ targetType: "NONE", target: "  ", sortOrder: "" })).toEqual({
            targetType: undefined,
            target: undefined,
            sortOrder: 0,
        })
        expect(
            toTargetSortFields({ targetType: "URL", target: " https://a.cn ", sortOrder: "3" }),
        ).toEqual({ targetType: "URL", target: "https://a.cn", sortOrder: 3 })
    })

    it("片段校验与三张表单同源：排序只认非负整数，target 有上限", () => {
        expect(
            CmsTargetSortSchema.safeParse({ targetType: "NONE", target: "", sortOrder: "-1" })
                .success,
        ).toBe(false)
        expect(
            CmsTargetSortSchema.safeParse({ targetType: "NONE", target: "", sortOrder: "1.5" })
                .success,
        ).toBe(false)
        expect(
            CmsTargetSortSchema.safeParse({ targetType: "NONE", target: "", sortOrder: "" })
                .success,
        ).toBe(true)
        expect(
            CmsTargetSortSchema.safeParse({
                targetType: "PRODUCT",
                target: "x".repeat(256),
                sortOrder: "1",
            }).success,
        ).toBe(false)
    })

    it("往返闭合：响应行 → 表单 → 请求体，不认识的跳转类型不会原样发回后端", () => {
        const row = { targetType: "MINI_PROGRAM", target: "abc", sortOrder: 5 }
        expect(toTargetSortFields(targetSortDefaults(row))).toEqual({
            targetType: undefined,
            target: "abc",
            sortOrder: 5,
        })
    })
})
