import { describe, expect, it } from "vite-plus/test"

import { feedTabCategoryId } from "./queries"

const CATEGORY_ID = "01900000-0000-7000-8000-000000000105"

describe("feedTabCategoryId", () => {
    it("类目页签_传它的 id", () => {
        expect(feedTabCategoryId({ id: CATEGORY_ID, name: "智能手机" })).toBe(CATEGORY_ID)
    })

    it("全部页签_全站", () => {
        expect(
            feedTabCategoryId({ id: "all", nameKey: "home.recommend.all", isDefault: true }),
        ).toBeUndefined()
    })

    it("没有选中项_全站", () => {
        expect(feedTabCategoryId(undefined)).toBeUndefined()
    })
})
