import { describe, expect, it } from "vitest"

import type { PagedItems } from "./pagination"

import { paged } from "./pagination"

/**
 * 页码序列：当前页 ±2 + 首尾 + 省略号。
 *
 * 只钉两件事：省略号**不能出现在只差一页的缝隙上**（`1 … 3` 那种，中间其实没漏页，
 * 却让用户以为列表被折断了），以及首尾页任何时刻都在（不点到底就翻不完）。
 */

const gap = (items: PagedItems) => items.filter((i) => i === "...").length

describe("paged", () => {
    it("总页数不超过 7：全展开，一个省略号都不该有", () => {
        expect(paged(1, 5)).toEqual([1, 2, 3, 4, 5])
        expect(paged(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
    })

    it("当前页在第一屏：尾部才出现省略号，且紧接尾页", () => {
        expect(paged(1, 10)).toEqual([1, 2, 3, "...", 10])
    })

    it("当前页在尾部：头部省略号紧跟第 1 页", () => {
        expect(paged(10, 10)).toEqual([1, "...", 8, 9, 10])
    })

    it("当前页在中间：两头各一个省略号", () => {
        expect(paged(5, 20)).toEqual([1, "...", 3, 4, 5, 6, 7, "...", 20])
    })

    it("紧邻首尾时不留假省略号：第 2 页时 1 与窗口相邻，不该断成「1 … 2」", () => {
        expect(gap(paged(2, 10))).toBe(1)
        expect(paged(2, 10)).toEqual([1, 2, 3, 4, "...", 10])
        expect(paged(9, 10)).toEqual([1, "...", 7, 8, 9, 10])
    })

    it("首尾页恒在：用户任何时候都能一步跳到两端", () => {
        for (let current = 1; current <= 20; current++) {
            const items = paged(current, 20).filter((i): i is number => i !== "...")
            expect(items).toContain(1)
            expect(items).toContain(20)
        }
    })

    it("当前页越界（页码来自 URL）：只剩首尾，不吐负数页或第 97 页", () => {
        expect(paged(99, 20)).toEqual([1, "...", 20])
        expect(paged(0, 20)).toEqual([1, 2, "...", 20])
    })
})
