import { describe, expect, it } from "vite-plus/test"

import type { RecommendTabResponse } from "@shop/api/sdk"
import { makeRecommendTab as makeTabImpl } from "@shop/test-utils/fixtures"

import { feedCategoryId } from "./queries"

const CATEGORY_ID = "01900000-0000-7000-8000-000000000105"

function makeTab(overrides: Partial<RecommendTabResponse>): RecommendTabResponse {
    return makeTabImpl(overrides)
}

describe("feedCategoryId", () => {
    it("类目型词条_传它指向的类目", () => {
        expect(feedCategoryId(makeTab({ targetType: "CATEGORY", target: CATEGORY_ID }))).toBe(
            CATEGORY_ID,
        )
    })

    it("搜索型与无目标_一律全站", () => {
        expect(feedCategoryId(makeTab({ targetType: "SEARCH", target: "连衣裙" }))).toBeUndefined()
        expect(feedCategoryId(makeTab({ targetType: null, target: null }))).toBeUndefined()
    })

    it("类目型但目标为空_回落全站而不是空串", () => {
        expect(feedCategoryId(makeTab({ targetType: "CATEGORY", target: null }))).toBeUndefined()
    })

    it("没有选中项_全站", () => {
        expect(feedCategoryId(undefined)).toBeUndefined()
    })
})
