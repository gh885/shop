import { useMutation } from "@tanstack/react-query"

import { notify } from "@shop/app-kit"

/**
 * useWriteMutation —— 卖家端写操作（增删改/上下架/发货…）的统一接线。
 *
 * 三件事在每个写操作里都要做，不该各写一遍：
 * 1. 成功后失效相关查询缓存（key 前缀或当前店铺上下文相关的 key 工厂）；
 * 2. 成功后 toast 成功文案；
 * 3. 失败统一走 notify.fromError（后端 detail 优先）。
 *
 * 需要在成功时额外做别的（回填缓存、关弹窗）就传 onSuccess，它先于 toast 执行。
 * 未登录/无上下文这类 enabled 语义留在调用方（query 层），这里只管写。
 */
export function useWriteMutation<TInput, TData = unknown>({
    mutationFn,
    messages,
    invalidate,
    onSuccess,
}: {
    mutationFn: (input: TInput) => Promise<TData>
    messages: { success: string; error?: string }
    /** 成功后的缓存失效：通常传 () => queryClient.invalidateQueries({ queryKey }) */
    invalidate?: () => void
    onSuccess?: (data: TData, input: TInput) => void
}) {
    return useMutation({
        mutationFn,
        onSuccess: (data, input) => {
            invalidate?.()
            onSuccess?.(data, input)
            notify.success(messages.success)
        },
        onError: (err) => notify.fromError(err, messages.error),
    })
}
