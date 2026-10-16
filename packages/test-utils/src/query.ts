import { QueryClient } from "@tanstack/react-query"

/** 每个测试独立的 QueryClient：禁 retry 求确定性、隔离避免跨用例缓存串场。 */
export function createTestQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    })
}
