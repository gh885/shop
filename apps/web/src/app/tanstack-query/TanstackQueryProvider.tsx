import {
    QueryClientProvider,
    QueryErrorResetBoundary,
    type QueryClient,
} from "@tanstack/react-query"

import { createAppQueryClient } from "@shop/app-kit/data"
import { webMessages } from "#/locales"
import { createAppI18n, localeOf } from "@shop/app-kit/i18n"
import { getBrowserI18n } from "#/shared/lib/i18n"
import { createIsomorphicFn } from "@tanstack/react-start"
import { resolveRequestLocale } from "#/shared/lib/request-locale"

const createRuntime = createIsomorphicFn()
    .server(() => createAppI18n(resolveRequestLocale(), webMessages))
    .client(() => getBrowserI18n())

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
