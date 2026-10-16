import { MutationCache, QueryClient, type DefaultOptions } from "@tanstack/react-query"

import { toApiError } from "@shop/common/contract"
import { localeOf, type I18nInstance } from "@shop/i18n"
import { mutationError, mutationSuccess } from "./notify"
import { resolveToastText } from "./toast-text"

/**
 * 应用级 QueryClient 的唯一构造口（三端共用默认值）。口径是「默认吵、退出要显式」：忘写声明的后果是多提示一次/多抛一层，不是静默不生效。读写两侧的默认/逐点/退出对照与完整理由见 docs/conventions/frontend.md「服务端状态」「写操作」与 query-convergence.md
 *
 * `i18n` 必填：这里是全仓唯一「拿不到 hook 又必须知道当前语言」的写回执点（§3.5），做成可选的表现是忘了传 → toast 恒用平台默认语言且不报错
 */
export function createAppQueryClient(
    i18n: I18nInstance,
    overrides: AppQueryClientOverrides = {},
): QueryClient {
    return new QueryClient({
        /** 用官方 MutationCache 而非 hook 工厂：全局回调先于逐点执行，失效发生在调用方 onSuccess 之前；见 query-convergence.md §3 */
        mutationCache: new MutationCache({
            onSuccess: (_data, _variables, _onMutateResult, mutation, { client }) => {
                const meta = mutation.options.meta
                // 句子用本闭包注入的 i18n 现取（§3.5），成品串交给 mutationSuccess，不经全局 notifyI18n
                if (meta?.success) mutationSuccess(resolveToastText(meta.success, i18n))
                for (const queryKey of meta?.invalidates ?? []) {
                    void client.invalidateQueries({ queryKey })
                }
            },
            onError: (error, _variables, _onMutateResult, mutation) => {
                const meta = mutation.options.meta
                if (meta?.silentError) return
                const fallbackText = meta?.error ? resolveToastText(meta.error, i18n) : undefined
                mutationError(error, localeOf(i18n), fallbackText)
            },
        }),
        defaultOptions: {
            queries: {
                staleTime: 10_000,
                throwOnError: throwWhenNoData,
                // 4xx 一次都不重、其余只重 1 次：传输层（sdk-client）已对 408/429/5xx 重 2 次，库默认 3 次会叠成最多 12 次打后端
                retry: (failureCount: number, error: unknown) => {
                    const { status } = toApiError(error)
                    if (status >= 400 && status < 500) return false
                    return failureCount < 1
                },
                ...overrides.queries,
            },
            mutations: { ...overrides.mutations },
        },
    })
}

/** 测试装置专用逐项覆盖：拿真实默认值 + 禁 retry；放这里而非 test-utils 是防 test-utils→app-kit 反向依赖成环（见 docs/conventions/frontend.md:417） */
interface AppQueryClientOverrides {
    queries?: DefaultOptions["queries"]
    mutations?: DefaultOptions["mutations"]
}

/**
 * 只在「一条数据都没有可展示」时抛给边界（逐字等于官方 suspense 内部默认 defaultThrowOnError；该符号只从库内部模块导出、包入口不放深路径 import，只能复制）。useSuspenseQuery 收不到它、区块级查询退出的判据与例外清单见 docs/conventions/frontend.md「错误与重试」
 */
function throwWhenNoData(_error: unknown, query: { state: { data: unknown } }): boolean {
    return query.state.data === undefined
}
