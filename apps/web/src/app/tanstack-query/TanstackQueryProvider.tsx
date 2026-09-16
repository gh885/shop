import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

/** 创建应用级 QueryClient 并放入 router context（SSR/客户端共用同一份）。
 *  defaultOptions 只做保守兜底：忘写 staleTime 的查询不再 mount 即 refetch；
 *  需要即时性的查询（结算预览等）在各自 queryOptions 显式声明，per-query 配置优先于此默认值。 */
export function getContext() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 10_000,
            },
        },
    })

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
