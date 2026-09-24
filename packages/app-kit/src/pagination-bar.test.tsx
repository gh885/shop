import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { PaginationBar } from "./pagination-bar"

/**
 * 分页条渲染层的约定（页码算法 `paged` 的测试在 ui-web `lib/utils.test.ts`）：
 * - `PaginationBar`（渲染）：禁用态必须**看得出来**（光有 aria-disabled 是个视觉上照常可点的
 *   按钮，这是收敛前卖家端的真实缺陷），以及越界页码不能被送出去。
 */

describe("PaginationBar", () => {
    it("只有一页：整条不渲染，不摆「上一页 1 下一页」占位", () => {
        const noop = vi.fn<(page: number) => void>()
        const { container } = render(
            <PaginationBar
                page={1}
                totalPages={1}
                onPageChange={noop}
            />,
        )
        expect(container).toBeEmptyDOMElement()
        expect(noop).not.toHaveBeenCalled()
    })

    it("首页的「上一页」禁用态看得出来：aria-disabled 之外还要置灰不可点", () => {
        // 收敛前卖家端只写了 aria-disabled —— 读屏软件知道它禁用，眼睛看不出，
        // 而 ui-web 的 PaginationLink 本来就认 disabled 这个 prop。
        render(
            <PaginationBar
                page={1}
                totalPages={20}
                onPageChange={() => {}}
            />,
        )
        const prev = screen.getByRole("button", { name: "上一页" })
        expect(prev).toHaveAttribute("aria-disabled", "true")
        expect(prev.className).toContain("pointer-events-none")
    })

    it("末页的「下一页」同样禁用，尾页页码仍是可点的当前页", () => {
        render(
            <PaginationBar
                page={20}
                totalPages={20}
                onPageChange={() => {}}
            />,
        )
        expect(screen.getByRole("button", { name: "下一页" })).toHaveAttribute(
            "aria-disabled",
            "true",
        )
        expect(screen.getByRole("button", { name: "20" })).toHaveAttribute("aria-current", "page")
    })

    it("点页码与上下页：把目标页原样交给 onPageChange，写回哪里由调用方决定", async () => {
        const user = userEvent.setup()
        const onPageChange = vi.fn<(page: number) => void>()
        render(
            <PaginationBar
                page={5}
                totalPages={20}
                onPageChange={onPageChange}
            />,
        )

        await user.click(screen.getByRole("button", { name: "上一页" }))
        await user.click(screen.getByRole("button", { name: "下一页" }))
        await user.click(screen.getByRole("button", { name: "20" }))
        expect(onPageChange.mock.calls).toEqual([[4], [6], [20]])
    })

    it("禁用态在测试环境挡不住点击：越界页码由范围守卫拦下", async () => {
        const user = userEvent.setup()
        const onPageChange = vi.fn<(page: number) => void>()
        render(
            <PaginationBar
                page={1}
                totalPages={20}
                onPageChange={onPageChange}
            />,
        )

        // jsdom 不加载 Tailwind，pointer-events-none 只是串类名；真实浏览器里键盘回车也能绕过它，
        // 两道保险只剩这道守卫生效，所以必须由它挡住 page=0
        await user.click(screen.getByRole("button", { name: "上一页" }))
        expect(onPageChange).not.toHaveBeenCalled()
    })

    it("中段页码：两头各一个省略号，首尾页都还在按钮里", () => {
        const { container } = render(
            <PaginationBar
                page={5}
                totalPages={20}
                onPageChange={() => {}}
            />,
        )
        expect(container.querySelectorAll('[data-slot="pagination-ellipsis"]')).toHaveLength(2)
        // 分页项由 ui-web Button 渲染成 <a role="button">（点击被 preventDefault 接管，不当链接用），
        // 于是按 role 取到的既有上下页也有页码；只留纯数字那些比对页码序列
        const pageButtons = screen
            .getAllByRole("button")
            .map((a) => a.textContent)
            .filter((t) => /^\d+$/.test(t))
        expect(pageButtons).toEqual(["1", "3", "4", "5", "6", "7", "20"])
    })
})
