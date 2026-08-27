import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

/** 创建应用级 QueryClient 并放入 router context（SSR/客户端共用同一份） */
export function getContext() {
    const queryClient = new QueryClient()

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
