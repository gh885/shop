import type { MutationOptions, QueryKey } from "@tanstack/react-query"

import type { MutationMeta } from "./mutation-meta"

/** 乐观列表更新的官方配方固化（cancelQueries→快照→patch / 回滚 / 失效，顺序写反只并发下偶发出错）；形态对齐官方 mutationOptions，反馈不在这里（走 meta + 全局 MutationCache）。四条硬规矩见 docs/conventions/frontend.md「写操作」 */
interface OptimisticListMutationConfig<TData, TVars> {
    queryKey: QueryKey
    mutationFn: (vars: TVars) => Promise<unknown>
    /** 给定旧列表与变量返回 patch 后的列表——领域自己的规则 */
    patch: (list: TData[], vars: TVars) => TData[]
    meta?: MutationMeta
}

/** 回滚快照类型：经 onMutate 返回值传给 onError */
type OptimisticContext<TData> = { prev: TData[] | undefined }

export function optimisticListMutationOptions<TData, TVars>({
    queryKey,
    mutationFn,
    patch,
    meta,
}: OptimisticListMutationConfig<TData, TVars>): MutationOptions<
    unknown,
    Error,
    TVars,
    OptimisticContext<TData>
> {
    return {
        mutationFn,
        meta,
        onMutate: async (vars, { client }) => {
            await client.cancelQueries({ queryKey })
            const prev = client.getQueryData<TData[]>(queryKey)
            client.setQueryData<TData[]>(queryKey, (old) => patch(old ?? [], vars))
            return { prev }
        },
        onError: (_error, _vars, ctx, { client }) => {
            // 只回滚「确有快照」的情况：发起时缓存还没数据，写回 undefined 等于把列表清空
            if (ctx?.prev === undefined) return
            client.setQueryData(queryKey, ctx.prev)
        },
        onSettled: (_data, _error, _vars, _ctx, { client }) => {
            void client.invalidateQueries({ queryKey })
        },
    }
}
