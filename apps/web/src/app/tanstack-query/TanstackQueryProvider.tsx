import {
    QueryClientProvider,
    QueryErrorResetBoundary,
    type QueryClient,
} from "@tanstack/react-query"

import { createAppQueryClient } from "@shop/app-kit/data"
import { webMessages } from "#/locales"
import { localeScope } from "#/shared/lib/locale-scope"
import { resolveRequestLocale } from "#/shared/lib/request-locale"

/** 创建应用级 QueryClient 并放入 router context（SSR/客户端共用同一份）。
 *  默认值（staleTime 兜底等）的唯一真相源在 @shop/app-kit 的 createAppQueryClient ——
 *  三端必须一致，否则「忘写 staleTime 的查询」在 web 有兜底、在别的端会 mount 即重拉。
 *  需要即时性的查询（结算预览等）在各自 queryOptions 显式声明，per-query 配置优先于默认值。
 *  scope 是装配注入的那一个 Locale 持有者：全局写操作失败提示的兜底文案要按语言取（§3.5）。
 *  webMessages 交给 MutationCache：写操作回执 `{ key }` 形态的句子按它 + scope.locale 现取（§6.1）。
 *  locale 是首屏 Locale（i18n.md §5.2）：服务端按请求解析、客户端从 <html lang> 继承，随 router context
 *  送到 `__root` 的 I18nProvider 作 initialLocale，让 SSR 首屏 lang/标题/描述就是对的。 */
export function getContext() {
    const queryClient = createAppQueryClient(localeScope, { resources: webMessages })
    const locale = resolveRequestLocale()

    return {
        queryClient,
        locale,
    }
}

/**
 * TanStack Query 提供者：为整个应用（含 shell）注入 QueryClientProvider。
 * 在 __root 的 RootDocument 中包裹 children。
 *
 * 外层还套了官方 `QueryErrorResetBoundary`：路由级错误页（`defaultErrorComponent`）与区块级
 * `QueryBoundary` 都要靠它提供「重置查询错误」的 reset —— suspense / throwOnError 查询失败后
 * 不重置这个标记，重挂载不会重新取数，重试按钮就是死的。
 */
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
