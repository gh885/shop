import { QueryClientProvider, type QueryClient } from "@tanstack/react-query"
import { render, type RenderOptions, type RenderResult } from "@testing-library/react"
import type { ReactElement } from "react"

import { createTestQueryClient } from "./query"

/**
 * 测试用 render：挂独立的 QueryClientProvider（每个 render 一个新 client，互不串缓存）。
 *
 * 三个 app 的组件测试不直接用这里，而是走 `@shop/app-kit/test` 的统一薄包装
 * （应用真实 QueryClient 默认值 + ConfirmDialogHost；需要路由上下文的用那里的 renderWithRouter）。
 *
 * `queryClient` 参数是给薄包装传 `createAppQueryClient({ queries: { retry: false } })` 用的：
 * 裸 `createTestQueryClient` 不带应用默认值，`throwOnError`、写操作的全局 toast 这些
 * 「生产里一定生效」的行为在测试里根本走不到，测试就只能证明「这套默认值不存在时一切正常」。
 * 不在这里直接 import 应用工厂：那会让 test-utils 反向依赖 app-kit 成环
 * （app-kit 的 devDependencies 已依赖 test-utils）。
 */
export function renderWithProviders(
    ui: ReactElement,
    options?: Omit<RenderOptions, "wrapper"> & { queryClient?: QueryClient },
): RenderResult {
    const { queryClient = createTestQueryClient(), ...renderOptions } = options ?? {}
    return render(ui, {
        wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
        ...renderOptions,
    })
}
