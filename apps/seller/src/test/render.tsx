import type { ReactElement } from "react"

import { createAppQueryClient } from "@shop/app-kit"
import { ConfirmDialogHost } from "@shop/ui-web"
import { renderWithProviders as renderWithQuery } from "@shop/test-utils"

/**
 * 需要自己持有 client 实例的 hook 测试用（`renderWithProviders` 内部也是它）。
 *
 * 用 `createAppQueryClient` 而不是裸 `createTestQueryClient`：全局 `throwOnError` 与写操作的
 * 全局 toast/失效都挂在这套默认值上，测试里若走裸 client 就永远测不到它们。只关掉 retry 换确定性。
 */
export function createAppTestQueryClient() {
    return createAppQueryClient({ queries: { retry: false }, mutations: { retry: false } })
}

/**
 * seller 侧测试 render：在 test-utils 的统一实现上补应用真实的 QueryClient 默认值与全局确认弹窗挂载层。
 * 需要路由上下文的组件测试，在本文件追加 MemoryRouter/RouterProvider —— 改这一处，不动用例。
 */
export function renderWithProviders(ui: ReactElement) {
    return renderWithQuery(
        <>
            {ui}
            <ConfirmDialogHost />
        </>,
        { queryClient: createAppTestQueryClient() },
    )
}
