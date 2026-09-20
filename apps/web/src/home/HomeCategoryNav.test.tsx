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
 * 首页导航区块的三态口径（ShopBar 同形）：
 * 1. 失败 → 块级错误 + 重试（QueryBoundary 官方 reset 链路），**不**伪装成「即将上线」；
 * 2. 空数组 → 真正的运营空配置才给「即将上线」；
 * 3. 成功 → 词条列表，hover 有子组的词条展开 Mega 面板。
 *
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

describe("首页分类导航三态", () => {
    it("接口失败_块级错误可重试_重试成功后恢复列表", async () => {
        let failing = true
        server.use(
            http.get(NAV_URL, () => {
                if (failing) {
                    failing = false
                    return HttpResponse.json(
                        { status: 500, detail: "服务开小差了" },
                        { status: 500 },
                    )
                }
                return HttpResponse.json([makeEntry()])
            }),
        )

        renderNav()
        const alert = await screen.findByRole("alert")
        expect(alert).toHaveTextContent("服务开小差了")
        // 失败不许伪装成空态文案
        expect(screen.queryByText("商品分类即将上线，敬请期待")).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "重试" }))

        expect(await screen.findByText("家用电器")).toBeInTheDocument()
        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    })

    it("空配置_即将上线空态_不是错误态", async () => {
        server.use(http.get(NAV_URL, () => HttpResponse.json([])))

        renderNav()

        expect(await screen.findByText("商品分类即将上线，敬请期待")).toBeInTheDocument()
        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    })

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
})
