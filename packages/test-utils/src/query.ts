import { QueryClient } from "@tanstack/react-query"

/**
 * 每个测试独立的 QueryClient：禁 retry（测试要确定性），避免跨用例缓存串场。
 * 用法：renderWithProviders 里 new 一个挂在 Provider 上；断言缓存/失效行为时拿到它。
 */
export function createTestQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    })
}
