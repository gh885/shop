import { useMutation, useQueryClient } from "@tanstack/react-query"

import { notify } from "./toast"

interface OptimisticListMutationOptions<TData, TVars> {
    /** 列表缓存 key（如 ["cart-items"]） */
    queryKey: readonly unknown[]
    mutationFn: (vars: TVars) => Promise<unknown>
    /** 给定旧列表与变量，返回乐观 patch 后的列表 */
    patch: (list: TData[], vars: TVars) => TData[]
    messages: {
        /** 成功提示（可选；购物车类高频操作不提示） */
        success?: string
        error: string
    }
}

/**
 * 乐观更新 mutation 工厂（购物车勾选/数量/删除与地址删除/默认态共用脚手架）：
 * onMutate 先本地改缓存、失败回滚 prev、成功提示、settled 失效重取。
 */
export function useOptimisticListMutation<TData, TVars>(
    options: OptimisticListMutationOptions<TData, TVars>,
) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: options.mutationFn,
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
        onSettled: () => queryClient.invalidateQueries({ queryKey: options.queryKey }),
    })
}
