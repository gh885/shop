import { describe, expect, it } from "vite-plus/test"

import {
    cleanSearch,
    hasSearchCriteria,
    parseSearchParams,
    searchQueryKey,
    type SearchParamsInput,
} from "./search"

describe("搜索 URL 状态", () => {
    it("解析时 trim 关键词并收敛脏值", () => {
        expect(
            parseSearchParams({ q: "  跑步鞋  ", sort: "hot", page: "0" } as SearchParamsInput),
        ).toEqual({
            q: "跑步鞋",
        })
    })

    it("无关键词时只有合法类目才算有查询条件", () => {
        expect(hasSearchCriteria({ q: "   " })).toBe(false)
        expect(hasSearchCriteria({ categoryId: "00000000-0000-4000-8000-000000000001" })).toBe(true)
    })

    it("默认排序和第一页不进 URL，也不产生等价缓存键", () => {
        expect(cleanSearch({ q: "鞋", sort: "newest", page: 1 })).toEqual({ q: "鞋" })
        expect(searchQueryKey({ q: "鞋" })).toEqual({
            q: "鞋",
            categoryId: undefined,
            sort: "newest",
            page: 1,
        })
    })
})
