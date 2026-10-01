import type { MutationOptions, QueryKey } from "@tanstack/react-query"

import type { MutationMeta } from "./mutation-meta"

/**
 * 乐观列表更新：把**官方配方本身**参数化，剩下只交给领域一件事——「怎么 patch」。
 *
 * 官方《Optimistic Updates》指南给的顺序是有讲究的，写反了就只在并发下偶发出错：
 * 1. `onMutate`：**先 `cancelQueries`**（不取消在途重取，它回来会覆盖乐观值）→ 快照旧值 → 就地 patch；
 * 2. `onError`：用 `onMutate` 返回的快照回滚（快照只能经返回值传递，别去读已被污染的缓存）；
 * 3. `onSettled`：失效该列表，**最终以服务端为准**（乐观值只是过渡，可能被后端改写）。
 *
 * 这三步的顺序与快照的传递方式是「一错就静默坏」的地方（表现是「偶尔看到旧数据」，不报错、
 * 不白屏），所以固定在一次实现里，而不是让每个调用点各抄一遍。
 *
 * **形态刻意对齐官方 `queryOptions` / `mutationOptions`：纯函数返回 options 对象，hook 交给库。**
 * 调用点因此长这样，认得的就是官方 API：
 * ```ts
 * useMutation(optimisticListMutationOptions<CartItem, { id: string }>({
 *     queryKey: CART_ITEMS_KEY,
 *     mutationFn: ({ id }) => CartApi.removeCartItem({ path: { id } }),
 *     patch: (list, { id }) => removeItems(list, [id]),
 *     meta: { error: "删除失败", invalidates: [CART_COUNT_KEY] },
 * }))
 * ```
 *
 * 反馈不在这里：成功/失败 toast 一律由 `createAppQueryClient()` 的 `MutationCache` 按 `meta` 处理。
 * 于是这个工厂只管缓存编排，`meta.invalidates` 只管「这份回执还连带影响谁」（如头部角标计数），
 * 两件事不再混在一个 `messages` 里。
 */
interface OptimisticListMutationConfig<TData, TVars> {
    /** 要乐观 patch 的那个列表缓存 key（同时也是终态失效的目标） */
    queryKey: QueryKey
    /** 调服务端；失败即抛（SDK 已配 throwOnError，不存在「返回 { error }」的路径） */
    mutationFn: (vars: TVars) => Promise<unknown>
    /** 给定旧列表与变量，返回乐观 patch 后的列表——领域自己的规则 */
    patch: (list: TData[], vars: TVars) => TData[]
    /** 反馈与连带失效的声明 */
    meta?: MutationMeta
}

/** 回滚用的快照：经 `onMutate` 的返回值传给 `onError` */
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
