import { describe, expect, it } from "vitest"

import type { RecommendTabResponse } from "@shop/api/sdk"
import { makeRecommendTab as makeTabImpl } from "@shop/test-utils/fixtures"

import { feedCategoryId } from "./queries"

/**
 * tab → 召回范围：V13 的词条里「猜你喜欢」是搜索型（不该圈类目），「运动户外」这类才指向类目。
 * 判错的表现很隐蔽——要么所有 tab 都变成全站流（点了没反应），要么搜索型词条被塞进 categoryId 查出空流。
 */

const CATEGORY_ID = "01900000-0000-7000-8000-000000000105"

/** 契约夹具的 overrides 可省，这里要求显式给（每个用例都该说清是哪一种词条） */
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
        // target 可空：脏数据别变成 categoryId="" 打到后端（后端当未知类目 → 空流，用户看到空白首页）
        expect(feedCategoryId(makeTab({ targetType: "CATEGORY", target: null }))).toBeUndefined()
    })

    it("没有选中项_全站", () => {
        expect(feedCategoryId(undefined)).toBeUndefined()
    })
})
