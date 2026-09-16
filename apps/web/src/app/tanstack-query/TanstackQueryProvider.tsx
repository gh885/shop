import { QueryClientProvider, type QueryClient } from "@tanstack/react-query"

import { createAppQueryClient } from "@shop/app-kit"

/** 创建应用级 QueryClient 并放入 router context（SSR/客户端共用同一份）。
 *  默认值（staleTime 兜底等）的唯一真相源在 @shop/app-kit 的 createAppQueryClient ——
 *  三端必须一致，否则「忘写 staleTime 的查询」在 web 有兜底、在别的端会 mount 即重拉。
 *  需要即时性的查询（结算预览等）在各自 queryOptions 显式声明，per-query 配置优先于默认值。 */
export function getContext() {
    const queryClient = createAppQueryClient()

    return {
        queryClient,
    }
}

/**
 * TanStack Query 提供者：为整个应用（含 shell）注入 QueryClientProvider。
 * 在 __root 的 RootDocument 中包裹 children。
 */
export default function TanstackQueryProvider({
    queryClient,
    children,
}: {
    queryClient: QueryClient
    children: React.ReactNode
}) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
