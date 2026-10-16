import { QueryClientProvider, type QueryClient } from "@tanstack/react-query"
import { render, type RenderOptions, type RenderResult } from "@testing-library/react"
import type { ReactElement } from "react"

import { createTestQueryClient } from "./query"

/**
 * 测试用 render：挂独立 QueryClientProvider（每次新 client、不串缓存）。app 组件测试别直接用这里，走 `@shop/app-kit/test` 的统一薄包装（带应用真实 QueryClient 默认值 + ConfirmDialogHost）。
 * `queryClient` 参数供薄包装注入带应用默认值的 client：裸 createTestQueryClient 不带 throwOnError、写操作全局 toast 这些「生产一定生效」的行为，测试就只能证明「默认值不存在时一切正常」。
 * 不在这里直接 import 应用工厂：会反向依赖 app-kit 成环（app-kit 的 devDependencies 已依赖 test-utils）。
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
