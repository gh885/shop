import { describe, expect, it } from "vite-plus/test"

import type { NavEntryResponse } from "@shop/api/sdk"

import { searchParamsForNavEntry, searchParamsForNavItem } from "./nav-target"

function entry(overrides: Partial<NavEntryResponse>): NavEntryResponse {
    return {
        id: "00000000-0000-4000-8000-000000000001",
        navKey: "home",
        title: "女装",
        iconKey: null,
        target: null,
        targetType: null,
        subs: [],
        sortOrder: 0,
        status: "ENABLED",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        ...overrides,
    }
}

describe("首页分类词条到搜索条件", () => {
    it("SEARCH 目标优先于标题", () => {
        expect(
            searchParamsForNavEntry(entry({ targetType: "SEARCH", target: "通勤背包" })),
        ).toEqual({
            q: "通勤背包",
        })
    })

    it("CATEGORY 目标走硬类目参数", () => {
        const categoryId = "00000000-0000-4000-8000-0000000000b1"
        expect(
            searchParamsForNavEntry(entry({ targetType: "CATEGORY", target: categoryId })),
        ).toEqual({
            categoryId,
        })
    })

    it("无目标的叶子词条按标题搜索；不支持的目标不伪跳", () => {
        expect(searchParamsForNavEntry(entry({ title: "跑步鞋" }))).toEqual({ q: "跑步鞋" })
        expect(
            searchParamsForNavEntry(entry({ targetType: "URL", target: "https://example.com" })),
        ).toBeUndefined()
    })

    it("组内字符串词条作为关键词，并 trim 空白", () => {
        expect(searchParamsForNavItem("  连衣裙  ")).toEqual({ q: "连衣裙" })
    })
})
