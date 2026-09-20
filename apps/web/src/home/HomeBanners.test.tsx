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
import { describe, expect, it } from "vitest"

import type { BannerResponse } from "@shop/api/sdk"
import { server } from "@shop/test-utils"

import { createAppTestQueryClient } from "#/test/render"

import { HomeBanners } from "./HomeBanners"

/**
 * 首页 banner 条三态（与 HomeCategoryNav.test 同一口径）：
 * 失败 → 块级错误 + 重试恢复；空配置 → 整块不画（既不是错误也不是占位）。
 * banner 卡里有 Link，照旧自带内存路由。
 */

const BANNERS_URL = "*/api/cms/banners"

function makeBanner(overrides: Partial<BannerResponse> = {}): BannerResponse {
    return {
        id: "01900000-0000-7000-8000-0000000000b1",
        slot: "home_promo",
        title: "家电焕新季",
        subtitle: "满1000减100",
        imageUrl: "https://img.example.com/banner1.jpg",
        target: null,
        targetType: null,
        link: null,
        sortOrder: 0,
        status: "ENABLED",
        startAt: null,
        endAt: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        ...overrides,
    }
}

function renderBanners() {
    const rootRoute = createRootRoute({
        component: () => (
            <>
                <HomeBanners />
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
    return render(
        <QueryClientProvider client={createAppTestQueryClient()}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    )
}

describe("首页 banner 条三态", () => {
    it("接口失败_块级错误可重试_重试成功后渲染banner", async () => {
        let failing = true
        server.use(
            http.get(BANNERS_URL, () => {
                if (failing) {
                    failing = false
                    return HttpResponse.json(
                        { status: 500, detail: "服务开小差了" },
                        { status: 500 },
                    )
                }
                return HttpResponse.json([makeBanner()])
            }),
        )

        renderBanners()
        const alert = await screen.findByRole("alert")
        expect(alert).toHaveTextContent("服务开小差了")

        await userEvent.click(screen.getByRole("button", { name: "重试" }))

        expect(await screen.findByAltText("家电焕新季")).toBeInTheDocument()
        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    })

    it("空配置_整块不画_没有错误也没有占位", async () => {
        server.use(http.get(BANNERS_URL, () => HttpResponse.json([])))

        const { container } = renderBanners()

        // 数据落地后 Suspense 撤掉骨架 → 容器必须真空（不是错误块、不是占位卡）
        await waitFor(() => expect(container).toBeEmptyDOMElement())
        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    })
})
