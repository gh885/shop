import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vite-plus/test"

import { outOfRangePage, pageCount, useOutOfRangePageGuard } from "./out-of-range-page"

/** 越界页码收口：页码是派生量、越界只能在数据落定后判定，修正是「擦掉错误状态」不是「用户走一步」；钉最易写错的三条（返回 undefined、空列表回第 1 页、总数没到手不判定） */

describe("outOfRangePage", () => {
    it("页码合法时返回 undefined：调用方据此不写 URL，否则每次数据变化都导航一次", () => {
        expect(outOfRangePage(1, 1)).toBeUndefined()
        expect(outOfRangePage(2, 5)).toBeUndefined()
        expect(outOfRangePage(5, 5)).toBeUndefined()
    })

    it("越界时退回最后一页，而不是第 1 页：用户在第 3 页删一条，不该被弹回开头", () => {
        expect(outOfRangePage(3, 2)).toBe(2)
        expect(outOfRangePage(99, 5)).toBe(5)
    })

    it("列表全空时退回第 1 页，不是 ?page=0（那会被 schema 的 .catch(1) 再兜一圈）", () => {
        expect(outOfRangePage(1, 0)).toBe(1)
        expect(outOfRangePage(99, 0)).toBe(1)
    })
})

describe("pageCount", () => {
    it("总数还没到手返回 0，让调用方跳过判定", () => {
        expect(pageCount(undefined, 10)).toBe(0)
    })

    it("空列表也算 1 页：0 页的分页条没有意义", () => {
        expect(pageCount(0, 10)).toBe(1)
    })

    it("向上取整：20 条整两页，21 条是三页", () => {
        expect(pageCount(20, 10)).toBe(2)
        expect(pageCount(21, 10)).toBe(3)
    })
})

describe("useOutOfRangePageGuard", () => {
    it("数据没到手不判定：拿上一轮的 total 钳新页会在翻页瞬间误判", () => {
        const onFix = vi.fn<(page: number) => void>()
        renderHook(() => useOutOfRangePageGuard({ page: 3, total: undefined, size: 10, onFix }))

        expect(onFix).not.toHaveBeenCalled()
    })

    it("页码合法时不动 URL", () => {
        const onFix = vi.fn<(page: number) => void>()
        renderHook(() => useOutOfRangePageGuard({ page: 2, total: 42, size: 10, onFix }))

        expect(onFix).not.toHaveBeenCalled()
    })

    it("数据到达后发现越界，退回最后一页", () => {
        const onFix = vi.fn<(page: number) => void>()
        renderHook(() => useOutOfRangePageGuard({ page: 3, total: 11, size: 10, onFix }))

        expect(onFix).toHaveBeenCalledTimes(1)
        expect(onFix).toHaveBeenCalledWith(2)
    })

    it("修正后页码就合法了，重渲染不会重复导航", () => {
        const onFix = vi.fn<(page: number) => void>()
        const { rerender } = renderHook(
            ({ page, total }) => useOutOfRangePageGuard({ page, total, size: 10, onFix }),
            { initialProps: { page: 3, total: 11 } },
        )
        expect(onFix).toHaveBeenCalledTimes(1)

        rerender({ page: 2, total: 11 })

        expect(onFix).toHaveBeenCalledTimes(1)
    })

    it("列表收缩到当前页之外时同样收口：不只在「删除」这一条路径上生效", () => {
        const onFix = vi.fn<(page: number) => void>()
        const { rerender } = renderHook(
            ({ page, total }) => useOutOfRangePageGuard({ page, total, size: 10, onFix }),
            { initialProps: { page: 3, total: 30 } },
        )
        expect(onFix).not.toHaveBeenCalled()

        // 筛选/别人删了/换页签 —— 任何让 total 缩小的原因，都走同一个判据
        rerender({ page: 3, total: 15 })

        expect(onFix).toHaveBeenCalledTimes(1)
        expect(onFix).toHaveBeenCalledWith(2)
    })
})
