import { act, screen, waitFor } from "@testing-library/react"
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from "@tanstack/react-router"
import { HttpResponse, http } from "msw"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { createAppTestQueryClient, renderWithProviders } from "@shop/app-kit/test"
import { server } from "@shop/test-utils"
import { tokenStore } from "../shared/lib/api"
import { clearSessionKind, setSessionKind } from "../shared/lib/session-kind"
import { shopKeys } from "./queries"
import { ShopGate } from "./ShopGate"
import { useShop } from "./shop-context"

function ProtectedProduct() {
    useShop()
    return <span>商品页</span>
}

afterEach(() => {
    tokenStore.clear()
    clearSessionKind()
})

describe("ShopGate 跳转时的渲染边界", () => {
    it("无营业店铺直访商品页，只渲染店铺管理，不把旧商品页放出 Provider", async () => {
        tokenStore.set("test-token")
        const client = createAppTestQueryClient()
        client.setQueryData(shopKeys.mine(), [])
        let release!: () => void
        const pending = new Promise<void>((resolve) => {
            release = resolve
        })
        const root = createRootRoute({
            component: () => (
                <ShopGate>
                    <Outlet />
                </ShopGate>
            ),
            errorComponent: ({ error }) => (
                <span role="alert">{error instanceof Error ? error.message : String(error)}</span>
            ),
        })
        const product = createRoute({
            getParentRoute: () => root,
            path: "/product/list",
            component: ProtectedProduct,
        })
        const shops = createRoute({
            getParentRoute: () => root,
            path: "/shop/list",
            loader: () => pending,
            component: () => <span>店铺管理页面</span>,
        })
        const router = createRouter({
            routeTree: root.addChildren([product, shops]),
            history: createMemoryHistory({ initialEntries: ["/product/list"] }),
        })
        renderWithProviders(<RouterProvider router={router} />, { queryClient: client })
        await waitFor(() => expect(router.state.location.pathname).toBe("/shop/list"))
        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
        await act(async () => {
            release()
            await pending
        })
        expect(await screen.findByText("店铺管理页面")).toBeVisible()
        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
        expect(screen.queryByText("商品页")).not.toBeInTheDocument()
    })

    /**
     * 子账号的两条守卫行为，一条用例一起钉：
     * - 店的来源是 `/auth/subaccount/me` + 公开店读，**不能**打 `/shops/mine`（它只认买家令牌，必 401）；
     * - 店主专属页（`/shop/member`）对子账号送回工作台首屏，而不是让那个必然 403 的页面自己炸出来。
     */
    it("子账号：店的来源是子账号自述 + 公开店读，且店主专属页被送回工作台", async () => {
        const SHOP_ID = "11111111-1111-4111-8111-111111111111"
        tokenStore.set("subaccount-token")
        setSessionKind("subaccount")
        let mineCalls = 0
        server.use(
            http.get("*/auth/subaccount/me", () =>
                HttpResponse.json({
                    id: "22222222-2222-4222-8222-222222222222",
                    shopId: SHOP_ID,
                    loginName: "kefu01",
                    phone: "139****5678",
                    status: "ACTIVE",
                    permissions: [],
                }),
            ),
            http.get(`*/api/shops/${SHOP_ID}`, () =>
                HttpResponse.json({
                    id: SHOP_ID,
                    name: "甲店",
                    logoKey: null,
                    createdAt: "2026-01-01T00:00:00Z",
                }),
            ),
            http.get("*/shops/mine", () => {
                mineCalls++
                return HttpResponse.json([])
            }),
        )

        const root = createRootRoute({
            component: () => (
                <ShopGate>
                    <Outlet />
                </ShopGate>
            ),
            errorComponent: ({ error }) => (
                <span role="alert">{error instanceof Error ? error.message : String(error)}</span>
            ),
        })
        const home = createRoute({
            getParentRoute: () => root,
            path: "/",
            component: () => <ShopName />,
        })
        const member = createRoute({
            getParentRoute: () => root,
            path: "/shop/member",
            component: () => <span>子账号管理页面</span>,
        })
        const router = createRouter({
            routeTree: root.addChildren([home, member]),
            history: createMemoryHistory({ initialEntries: ["/shop/member"] }),
        })
        renderWithProviders(<RouterProvider router={router} />)

        await waitFor(() => expect(router.state.location.pathname).toBe("/"))
        expect(await screen.findByText("甲店")).toBeVisible()
        expect(screen.queryByText("子账号管理页面")).not.toBeInTheDocument()
        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
        // `/shops/mine` 一次都没打：子账号会话下它是必 401 的请求
        expect(mineCalls).toBe(0)
    })
})

/** 工作台首屏替身：把守卫注入的店名画出来，用来断言「店来自公开店读」 */
function ShopName() {
    const shop = useShop()
    return <span>{shop.name}</span>
}
