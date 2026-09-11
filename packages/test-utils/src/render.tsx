import { QueryClientProvider } from "@tanstack/react-query"
import { render, type RenderOptions, type RenderResult } from "@testing-library/react"
import type { ReactElement } from "react"

import { createTestQueryClient } from "./query"

/**
 * 测试用 render：挂独立的 QueryClientProvider（每个 render 一个新 client，互不串缓存）。
 *
 * 三个 app 的组件测试都走这里（各 app 的 src/test/render.tsx 只是再导出，
 * 需要路由上下文时改那一处，不动每个用例）。
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
