import { QueryClientProvider } from "@tanstack/react-query"
import { render, type RenderOptions, type RenderResult } from "@testing-library/react"
import type { ReactElement } from "react"

import { createTestQueryClient } from "@shop/test-utils"

/**
 * web 侧测试 render：挂 QueryClientProvider（每个 render 独立 QueryClient）。
 * 需要路由上下文的组件后续在此追加 MemoryRouter/RouterProvider —— 改这里，不改测试。
 */
export function renderWithProviders(
    ui: ReactElement,
    options?: Omit<RenderOptions, "wrapper">,
): RenderResult {
    return render(ui, {
        wrapper: ({ children }) => (
            <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
        ),
        ...options,
    })
}
