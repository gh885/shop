import type { ReactElement } from "react"
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    RouterProvider,
} from "@tanstack/react-router"
import { createAppQueryClient } from "@shop/app-kit"
import { ConfirmDialogHost } from "@shop/ui-web"
import { renderWithProviders as renderWithQuery } from "@shop/test-utils"

/** 需要自己持有 client 实例的测试用（下面的 renderWithProviders 内部也是它） */
export function createAppTestQueryClient() {
    return createAppQueryClient({ queries: { retry: false }, mutations: { retry: false } })
}

/**
 * 布局组件需要真实路由上下文；每次渲染隔离 history 与 QueryClient。
 *
 * QueryClient 用应用真实默认值（`createAppQueryClient`）而不是裸 client，只关掉 retry 换确定性
 * ——全局 `throwOnError` 与写操作的全局 toast 都挂在那套默认值上，裸 client 测不到它们。
 */
export function renderWithProviders(
    ui: ReactElement,
    { initialEntry = "/" }: { initialEntry?: string } = {},
) {
    const root = createRootRoute({
        component: () => (
            <>
                {ui}
                <ConfirmDialogHost />
            </>
        ),
    })
    const index = createRoute({ getParentRoute: () => root, path: "/" })
    const fallback = createRoute({ getParentRoute: () => root, path: "$" })
    const router = createRouter({
        routeTree: root.addChildren([index, fallback]),
        history: createMemoryHistory({ initialEntries: [initialEntry] }),
    })
    return {
        ...renderWithQuery(<RouterProvider router={router} />, {
            queryClient: createAppTestQueryClient(),
        }),
        router,
    }
}
