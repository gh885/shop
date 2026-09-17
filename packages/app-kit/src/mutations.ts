import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query"

import { notify } from "./notify"

/**
 * 写操作接线的唯一实现（三个 app 共用）。
 *
 * 为什么在 app-kit：写操作的三件套 —— 成功后 toast + 失效缓存、失败走 notify.fromError 的
 * 「后端 detail 优先」文案策略 —— 同时依赖服务端契约语义（@shop/common 的 ApiError）与 UI
 * （@shop/ui-web 的 toast），与 notify 同属应用层胶水；各 app 各写一份必然漂移
 * （同一个动作在 A 端提示 detail、在 B 端吞掉错误）。
 *
 * 分工（这条边界别越）：
 * - 本文件只管「一次写操作该有的反馈与失效」，**不知道任何领域语义**：失效哪些 key 由调用方
 *   （域内 queries.ts / use-*.ts）传入，这里不 import 任何业务 key。
 * - 不需要缓存失效、也不需要统一文案的纯局部动作（登录页提交这类），直接用 useMutation 即可，
 *   不必为了「统一」硬套本工厂。
 *
 * 依赖的前提：mutationFn **失败即抛**。三端的 SDK 装配都设了 `throwOnError: true`
 * （packages/common/src/sdk-client.ts），非 2xx 归一成 ApiError 抛出，所以这里不需要
 * 「把 `{ data, error }` 里的 error 提升成异常」那层解包。**测试里的假 mutationFn 也不必
 * 造 `{ error }` 形状**——按真实契约 throw 才是有效用例（曾有一版解包逻辑只被这种假形状覆盖，
 * 生产路径根本走不到，等于用测试锁住了一段死代码）。
 */

export interface WriteMutationOptions<TInput, TData> {
    mutationFn: (input: TInput) => Promise<TData>
    messages: {
        /** 成功 toast 文案；silentSuccess 时可省（其余情况必填：写操作成功要给用户回执） */
        success?: string
        /** 失败兜底文案：后端有 detail 时以 detail 为准，网络层错误（status 0）才用它 */
        error?: string
    }
    /**
     * 静默成功：不弹成功 toast，其余（失效、错误提示）照旧。
     *
     * 少数场景里「成功」由后续动作给出反馈，此时再弹一条会打架 —— 例如收银台一次点按串起
     * 「发起流水 → 确认支付」两段，第一段弹「已发起」紧接着第二段弹「支付成功」，
     * 用户看到两条互相覆盖的提示。显式声明 silent，而不是把文案写成空串糊过去。
     */
    silentSuccess?: boolean
    /**
     * 成功后失效的 key；范围依赖回执/提交参数时用函数，无需自行获取 QueryClient。
     * 不传即「这个写操作不改变任何已缓存查询」——是显式声明，不是忘了写。
     */
    invalidateKeys?: readonly QueryKey[] | ((data: TData, input: TInput) => readonly QueryKey[])
    /** 逃生口：多个写操作与错误态重试共用一份失效逻辑（如列表页 hook），或需连带非失效副作用时使用；先于 onSuccess 执行 */
    invalidate?: () => void
    /** 成功时额外要做的事（回填缓存、关弹窗）；先于 toast 执行 */
    onSuccess?: (data: TData, input: TInput) => void
    /** 失败时额外要做的事（保持弹窗打开并高亮字段）；notify 之后执行 */
    onError?: (err: unknown, input: TInput) => void
}

/**
 * 写操作 mutation：成功 → invalidate → onSuccess → success toast；失败 → notify.fromError → onError。
 * 调用方拿到的仍是标准 UseMutationResult（isPending / variables / mutate / mutateAsync 一应俱全）。
 *
 * 不适用它的情况（这些继续用裸 useMutation，是正当的，不是漏网）：
 * - 失败要就地显示在表单里而不是 toast（改密码把后端 detail 渲染在字段下）
 * - 终态才处理且与成败无关（登出：成功失败都要清本地态 → onSettled）
 * - 成功即整页跳转/刷新，没有任何缓存需要在当前页面失效
 */
export function useWriteMutation<TInput, TData = unknown>({
    mutationFn,
    messages,
    silentSuccess,
    invalidateKeys,
    invalidate,
    onSuccess,
    onError,
}: WriteMutationOptions<TInput, TData>) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn,
        onSuccess: (data, input) => {
            const keys =
                typeof invalidateKeys === "function" ? invalidateKeys(data, input) : invalidateKeys
            for (const queryKey of keys ?? []) {
                void queryClient.invalidateQueries({ queryKey })
            }
            invalidate?.()
            onSuccess?.(data, input)
            if (!silentSuccess && messages.success) notify.success(messages.success)
        },
        onError: (err, input) => {
            notify.fromError(err, messages.error)
            onError?.(err, input)
        },
    })
}

export interface OptimisticListMutationOptions<TData, TVars> {
    /** 列表缓存 key（如 ["cart-items"]） */
    queryKey: QueryKey
    mutationFn: (vars: TVars) => Promise<unknown>
    /** 给定旧列表与变量，返回乐观 patch 后的列表 */
    patch: (list: TData[], vars: TVars) => TData[]
    /** 终态额外要失效的 key（如删购物车条目要连带刷新头部角标计数） */
    invalidateKeys?: readonly QueryKey[]
    messages: {
        /** 成功提示（可选；购物车类高频操作不提示） */
        success?: string
        /** 失败兜底文案：必填（乐观回滚后必须告诉用户没生效） */
        error: string
    }
}

/**
 * 乐观更新 mutation 工厂（购物车勾选/数量/删除、地址删除/默认态、收藏移出共用脚手架）：
 * - onMutate：取消在途查询 → 记录 prev → 就地 patch 缓存
 * - onError：恢复 prev + notify.fromError（乐观回滚必须让用户知道没生效）
 * - onSuccess：可选成功提示（高频操作不提示，避免刷屏）
 * - onSettled：失效列表本身与 invalidateKeys 里的关联缓存，最终以服务端为准
 *
 * mutationFn 抛错即回滚（SDK 已配 throwOnError）；无需自行构造「失败返回值」。
 */
export function useOptimisticListMutation<TData, TVars>({
    queryKey,
    mutationFn,
    patch,
    invalidateKeys,
    messages,
}: OptimisticListMutationOptions<TData, TVars>) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn,
        onMutate: async (vars: TVars) => {
            await queryClient.cancelQueries({ queryKey })
            const prev = queryClient.getQueryData<TData[]>(queryKey)
            queryClient.setQueryData<TData[]>(queryKey, (old) => patch(old ?? [], vars))
            return { prev }
        },
        onError: (err, _vars, ctx) => {
            queryClient.setQueryData(queryKey, ctx?.prev)
            notify.fromError(err, messages.error)
        },
        onSuccess: () => {
            if (messages.success) notify.success(messages.success)
        },
        onSettled: () => {
            for (const key of [queryKey, ...(invalidateKeys ?? [])]) {
                void queryClient.invalidateQueries({ queryKey: key })
            }
        },
    })
}
