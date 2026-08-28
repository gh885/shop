import { useMutation, useQueryClient } from "@tanstack/react-query"

import { notify } from "./toast"

interface OptimisticListMutationOptions<TData, TVars> {
    /** 列表缓存 key（如 ["cart-items"]） */
    queryKey: readonly unknown[]
    mutationFn: (vars: TVars) => Promise<unknown>
    /** 给定旧列表与变量，返回乐观 patch 后的列表 */
    patch: (list: TData[], vars: TVars) => TData[]
    /** 终态额外要失效的 key（如删购物车条目要连带刷新头部角标计数） */
    invalidateKeys?: readonly (readonly unknown[])[]
    messages: {
        /** 成功提示（可选；购物车类高频操作不提示） */
        success?: string
        error: string
    }
}

/**
 * 判断 mutationFn 的解包值是否属于「@shop/api 未抛错的结果对象」。
 * 生成的 SDK 方法在已配置客户端下返回 `{ data, error }`：error 存在即失败，但**不 throw**。
 * 若调用方已自行抛错，这里原样透传；否则把 result.error 提升为异常，触发 onError 回滚。
 */
function isErrorResult(value: unknown): value is { error: unknown } {
    return (
        typeof value === "object" &&
        value !== null &&
        "error" in value &&
        Boolean((value as { error?: unknown }).error)
    )
}

/**
 * 乐观更新 mutation 工厂（购物车勾选/数量/删除、地址删除/默认态、收藏移出共用脚手架）：
 * - 先对缓存做乐观 patch（onMutate + 记录 prev）
 * - 失败：恢复 prev + 提示（onError）
 * - 成功：可选提示（onSuccess）
 * - 终态：invalidate 失效重取（onSettled，含 invalidateKeys 里的关联缓存）
 *
 * mutationFn 同时兼容「抛错型」与「返回 { data, error } 型」，失败都能正确回滚。
 */
export function useOptimisticListMutation<TData, TVars>(
    options: OptimisticListMutationOptions<TData, TVars>,
) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (vars: TVars) => {
            const result = await options.mutationFn(vars)
            if (isErrorResult(result)) throw result.error
            return result
        },
        onMutate: async (vars) => {
            await queryClient.cancelQueries({ queryKey: options.queryKey })
            const prev = queryClient.getQueryData<TData[]>(options.queryKey)
            queryClient.setQueryData<TData[]>(options.queryKey, (old) =>
                options.patch(old ?? [], vars),
            )
            return { prev }
        },
        onError: (err, _vars, ctx) => {
            queryClient.setQueryData(options.queryKey, ctx?.prev)
            notify.fromError(err, options.messages.error)
        },
        onSuccess: () => {
            if (options.messages.success) notify.success(options.messages.success)
        },
        onSettled: () => {
            for (const key of [options.queryKey, ...(options.invalidateKeys ?? [])]) {
                void queryClient.invalidateQueries({ queryKey: key })
            }
        },
    })
}
