import { QueryClientProvider, type QueryClient } from "@tanstack/react-query"
import { render, type RenderOptions, type RenderResult } from "@testing-library/react"
import type { ReactElement } from "react"

import { createTestQueryClient } from "./query"

/**
 * 测试用 render：挂独立的 QueryClientProvider（每个 render 一个新 client，互不串缓存）。
 *
 * 三个 app 的组件测试都走这里（各 app 的 `src/test/render.tsx` 是薄包装，
 * 需要路由上下文、或要换成**应用真实默认值**时改那一处，不动每个用例）。
 *
 * `queryClient` 参数是给各 app 传 `createAppQueryClient({ queries: { retry: false } })` 用的：
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
