import type { ReactElement, ReactNode } from "react"
import { createElement } from "react"
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    RouterProvider,
} from "@tanstack/react-router"

import { QueryClientProvider } from "@tanstack/react-query"

import { createAppQueryClient } from "../query-client"

import { ConfirmDialogHost } from "@shop/ui-web"
import { renderWithProviders as renderWithQuery } from "@shop/test-utils"

/**
 * 三端共享的测试装置（原来各 app 一份 `src/test/render.tsx` 拷贝，同名不同实）。
 *
 * `createAppTestQueryClient`：需要自己持有 client 实例的 hook 测试用（下面两个 render 内部也是它）。
 * 用 `createAppQueryClient` 而不是裸 `createTestQueryClient`：全局 `throwOnError` 与写操作的
 * 全局 toast/失效都挂在这套默认值上，测试里若走裸 client 就永远测不到它们（会变成
 * 「生产里一定发生、测试里从不发生」的盲区）。只把 retry 关掉换确定性，其余照抄生产。
 */
export function createAppTestQueryClient() {
    return createAppQueryClient({ queries: { retry: false }, mutations: { retry: false } })
}

export function createAppTestHookClient() {
    const client = createAppTestQueryClient()
    return {
        client,
        wrapper: ({ children }: { children: ReactNode }) =>
            createElement(QueryClientProvider, { client }, children),
    }
}

/**
 * 组件/hook 测试的标准 render：应用真实 QueryClient 默认值 + 全局确认弹窗挂载层
 * （命令式 confirm 的渲染宿主，与生产根布局 <Toaster /> 旁挂法一致）。
 */
export function renderWithProviders(
    ui: ReactElement,
    {
        queryClient = createAppTestQueryClient(),
    }: { queryClient?: ReturnType<typeof createAppTestQueryClient> } = {},
) {
    return renderWithQuery(
        <>
            {ui}
            <ConfirmDialogHost />
        </>,
        { queryClient },
    )
}

/**
 * 需要真实路由上下文的测试（如工作台布局组件）：每次渲染挂一个隔离的 memory-history 路由，
 * 返回 router 供断言导航。QueryClient 同 `renderWithProviders`，用应用真实默认值。
 */
export function renderWithRouter(
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
    const queryClient = createAppTestQueryClient()
    return {
        ...renderWithQuery(<RouterProvider router={router} />, { queryClient }),
        queryClient,
        router,
    }
}
