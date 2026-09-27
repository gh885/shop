import { describe, expect, it } from "vitest"

import type { RecommendTabResponse } from "@shop/api/sdk"
import { makeRecommendTab } from "@shop/test-utils/fixtures"

import { tabDefaults, toTabRequest, tabRowToRequest } from "./form"

/**
 * 推荐位词条表单 → RecommendTabRequest，外加一条「响应行直接回手写成请求」的通路。
 *
 * `tabRowToRequest` 是给「把别的默认项改成非默认」那批全量覆写用的：它把响应里的
 * `string | null` 转成契约的 `?: string`。null 与缺省在响应里是一回事，在请求里不是。
 */

/** 本文件的词条一律是「手机 = 类目 1001」这一种，其余字段落在契约夹具的默认值上 */
function makeTab(overrides: Partial<RecommendTabResponse> = {}): RecommendTabResponse {
    return makeRecommendTab({
        id: "6f1a5b1e-2f3c-4a5d-8e9f-000000000001",
        name: "手机",
        target: "1001",
        targetType: "CATEGORY",
        isDefault: false,
        sortOrder: 1,
        updatedAt: "2026-01-02T00:00:00Z",
        ...overrides,
    })
}

const blankForm = () => ({
    name: "手机",
    targetType: "NONE" as const,
    target: "",
    isDefault: false,
    sortOrder: "",
})

describe("toTabRequest", () => {
    it("「不跳转」提交时是缺省：NONE 是表单档位，不是契约枚举", () => {
        expect(toTabRequest(blankForm()).targetType).toBeUndefined()
    })

    it("选了跳转类型才带 target", () => {
        const values = { ...blankForm(), targetType: "SEARCH" as const, target: " 手机 " }

        expect(toTabRequest(values)).toMatchObject({
            targetType: "SEARCH",
            target: "手机",
            name: "手机",
        })
    })

    it("排序空串按 0 解释：后端字段是 int", () => {
        expect(toTabRequest(blankForm()).sortOrder).toBe(0)
    })
})

describe("tabRowToRequest", () => {
    it("响应里的 null 折成缺省：全量覆写时不该把 null 发回请求体", () => {
        const body = JSON.stringify(tabRowToRequest(makeTab({ targetType: null, target: null })))

        expect(JSON.parse(body)).toEqual({ name: "手机", isDefault: false, sortOrder: 1 })
    })

    it("默认标记与排序原样带过去：取消别的默认项时，这几项除了 isDefault 都不该变", () => {
        const request = tabRowToRequest(makeTab({ isDefault: true }))

        expect(request).toEqual({
            name: "手机",
            targetType: "CATEGORY",
            target: "1001",
            isDefault: true,
            sortOrder: 1,
        })
    })
})

describe("tabDefaults", () => {
    it("新建：默认不勾「设为默认」，一个词条都不勾会让首页没有默认 tab", () => {
        const values = tabDefaults()

        expect(values).toMatchObject({ name: "", isDefault: false, sortOrder: "0" })
    })

    it("脏的跳转类型落回 NONE", () => {
        expect(tabDefaults(makeTab({ targetType: "MINI_PROGRAM" })).targetType).toBe("NONE")
    })
})
