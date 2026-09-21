import { QueryClientProvider } from "@tanstack/react-query"
import {
    Outlet,
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
} from "@tanstack/react-router"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { NavEntryResponse } from "@shop/api/sdk"
import { server } from "@shop/test-utils"

import { createAppTestQueryClient } from "#/test/render"

import { HomeCategoryNav } from "./HomeCategoryNav"

/**
 * 导航组件值得钉死的是两条自己的规则（[NAV-05]、[NAV-01]）：
 * 1. 行内合并名按宽度预算整组截断——装不下的整组不显示、不切半字，完整名留给 title tooltip；
 * 2. 有子组的词条 hover 展开右侧 Mega 面板，无子组的渲染为普通按钮——不挂假面板。
 *
 * 三态不在此复制：错误 + 重试链路归 QueryBoundary（packages/app-kit/query-boundary.test）。
 * 词条里有 Link，照 Feed.test 自带内存路由。
 */

const NAV_URL = "*/api/cms/nav"

function makeEntry(overrides: Partial<NavEntryResponse> = {}): NavEntryResponse {
    return {
        id: "01900000-0000-7000-8000-0000000000e1",
        navKey: "home",
        title: "家用电器",
        iconKey: "appliance",
        target: null,
        targetType: null,
        subs: [{ name: "厨房小电", items: ["电饭煲", "空气炸锅"] }],
        sortOrder: 0,
        status: "ENABLED",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        ...overrides,
    }
}

function renderNav() {
    const rootRoute = createRootRoute({
        component: () => (
            <>
                <HomeCategoryNav />
                <Outlet />
            </>
        ),
    })
    const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/",
        component: () => null,
    })
    const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute]),
        history: createMemoryHistory({ initialEntries: ["/"] }),
    })
    render(
        <QueryClientProvider client={createAppTestQueryClient()}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    )
}

// base-ui NavigationMenu 的浮层定位经 ResizeObserver 量锚点/面板，jsdom 没有——补最小实现
// （只补浏览器 API，不 mock 业务模块）
beforeEach(() => {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    )
})
afterEach(() => {
    vi.unstubAllGlobals()
})

describe("首页分类导航", () => {
    it("成功_hover 有子组的词条展开 Mega 面板_移开收起", async () => {
        server.use(
            http.get(NAV_URL, () =>
                HttpResponse.json([
                    makeEntry(),
                    makeEntry({
                        id: "01900000-0000-7000-8000-0000000000e2",
                        title: "手机数码",
                        subs: [],
                    }),
                ]),
            ),
        )

        renderNav()
        const entry = await screen.findByRole("button", { name: "家用电器" })
        expect(entry).toHaveAttribute("aria-expanded", "false")
        // 无子组的词条没有可展开的面板，不声明 aria-expanded
        expect(screen.getByRole("button", { name: "手机数码" })).not.toHaveAttribute(
            "aria-expanded",
        )

        // base-ui NavigationMenu 的 hover 有 50ms 意图延时，异步断言
        await userEvent.hover(entry)
        await screen.findByText("厨房小电")
        expect(entry).toHaveAttribute("aria-expanded", "true")
        expect(screen.getByText("电饭煲")).toBeInTheDocument()

        await userEvent.unhover(entry)
        await waitFor(() => expect(entry).toHaveAttribute("aria-expanded", "false"))
        // 收起后的卸载要等浮层收束动画，jsdom 不跑 transition——aria-expanded 已钉住「收起」语义
    })

    it("合并名超宽度预算_整组不显示不切半字_完整名留给tooltip", async () => {
        const fullTitle = "家用电器 / 厨房小电 / 大家电 / 个护小家电"
        server.use(http.get(NAV_URL, () => HttpResponse.json([makeEntry({ title: fullTitle })])))

        renderNav()
        const label = await screen.findByTitle(fullTitle)
        // 预算 210px：前三组（4+4+3 字 + 两个分隔符）187px 装得下，第四组要 257px → 整组出局
        expect(label).toHaveTextContent("家用电器 / 厨房小电 / 大家电")
        expect(label).not.toHaveTextContent("个护小家电")
    })
})
