import {
    QueryClientProvider,
    QueryErrorResetBoundary,
    type QueryClient,
} from "@tanstack/react-query"

import { bindNotifyI18n, createAppQueryClient } from "@shop/app-kit/data"
import { webMessages } from "#/locales"
import { createAppI18n, localeOf } from "@shop/app-kit/i18n"
import { getBrowserI18n } from "#/shared/lib/i18n"
import { createIsomorphicFn } from "@tanstack/react-start"
import { resolveRequestLocale } from "#/shared/lib/request-locale"

// 客户端顺带把浏览器单例注入 notify（与 queryClient 同一份实例）：SSR 分支不注入，notify 不在服务端调用。
const createRuntime = createIsomorphicFn()
    .server(() => createAppI18n(resolveRequestLocale(), webMessages))
    .client(() => {
        const i18n = getBrowserI18n()
        bindNotifyI18n(i18n)
        return i18n
    })

export function getContext() {
    const i18n = createRuntime()
    const queryClient = createAppQueryClient(i18n)
    const locale = localeOf(i18n)

    return {
        queryClient,
        locale,
        i18n,
    }
}

export default function TanstackQueryProvider({
    queryClient,
    children,
}: {
    queryClient: QueryClient
    children: React.ReactNode
}) {
    return (
        <QueryClientProvider client={queryClient}>
            <QueryErrorResetBoundary>{children}</QueryErrorResetBoundary>
        </QueryClientProvider>
    )
}
