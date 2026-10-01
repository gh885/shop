import { describe, expect, it } from "vite-plus/test"

import { makeNavEntry } from "@shop/test-utils/fixtures"

import { searchParamsForNavEntry, searchParamsForNavItem } from "./nav-target"

describe("首页分类词条到搜索条件", () => {
    it("SEARCH 目标优先于标题", () => {
        expect(
            searchParamsForNavEntry(makeNavEntry({ targetType: "SEARCH", target: "通勤背包" })),
        ).toEqual({
            q: "通勤背包",
        })
    })

    it("CATEGORY 目标走硬类目参数", () => {
        const categoryId = "00000000-0000-4000-8000-0000000000b1"
        expect(
            searchParamsForNavEntry(makeNavEntry({ targetType: "CATEGORY", target: categoryId })),
        ).toEqual({
            categoryId,
        })
    })

    it("无目标的叶子词条按标题搜索；不支持的目标不伪跳", () => {
        expect(searchParamsForNavEntry(makeNavEntry({ title: "跑步鞋" }))).toEqual({ q: "跑步鞋" })
        expect(
            searchParamsForNavEntry(
                makeNavEntry({ targetType: "URL", target: "https://example.com" }),
            ),
        ).toBeUndefined()
    })

    it("组内字符串词条作为关键词，并 trim 空白", () => {
        expect(searchParamsForNavItem("  连衣裙  ")).toEqual({ q: "连衣裙" })
    })
})
