import { describe, expect, it } from "vite-plus/test"

import { CATEGORY_MAX_LEVEL } from "./constants"
import { canNestUnder, isLeafCategory } from "./tree"

describe("层级上限的两句判定", () => {
    it("叶子那一层不能再挂子级，且它才是属性模板所在的一层", () => {
        expect(canNestUnder(CATEGORY_MAX_LEVEL)).toBe(false)
        expect(isLeafCategory(CATEGORY_MAX_LEVEL)).toBe(true)
    })

    it("叶子以下每一级都能挂子级，且都不是商品挂载点", () => {
        for (let level = 1; level < CATEGORY_MAX_LEVEL; level += 1) {
            expect(canNestUnder(level)).toBe(true)
            expect(isLeafCategory(level)).toBe(false)
        }
    })

    it("超过上限的脏值既不放开新建按钮也不算叶子（后端会拒，前端不跟着说谎）", () => {
        expect(canNestUnder(CATEGORY_MAX_LEVEL + 1)).toBe(false)
        expect(isLeafCategory(CATEGORY_MAX_LEVEL + 1)).toBe(false)
    })

    it("只看层级这一格：合成根的 0 级同样给放开（能不能挂由调用点另判）", () => {
        expect(canNestUnder(0)).toBe(true)
        expect(isLeafCategory(0)).toBe(false)
    })
})
