import type { ReactElement } from "react"
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    RouterProvider,
} from "@tanstack/react-router"
import { renderWithProviders as renderWithQuery } from "@shop/test-utils"

/** 布局组件需要真实路由上下文；每次渲染隔离 history 与 QueryClient。 */
export function renderWithProviders(
    ui: ReactElement,
    { initialEntry = "/" }: { initialEntry?: string } = {},
) {
    const root = createRootRoute({ component: () => ui })
    const index = createRoute({ getParentRoute: () => root, path: "/" })
    const fallback = createRoute({ getParentRoute: () => root, path: "$" })
    const router = createRouter({
        routeTree: root.addChildren([index, fallback]),
        history: createMemoryHistory({ initialEntries: [initialEntry] }),
    })
    return { ...renderWithQuery(<RouterProvider router={router} />), router }
}
