import { act, screen, waitFor } from "@testing-library/react"
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from "@tanstack/react-router"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { createAppTestQueryClient, renderWithProviders } from "@shop/app-kit/test"
import { tokenStore } from "../shared/lib/api"
import { shopKeys } from "./queries"
import { ShopGate } from "./ShopGate"
import { useShop } from "./shop-context"

function ProtectedProduct() {
    useShop()
    return <span>商品页</span>
}

afterEach(() => tokenStore.clear())

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
})
