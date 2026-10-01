import { QueryClientProvider, useMutation } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vite-plus/test"

import { createLocaleScope } from "../i18n/scope"
import { optimisticListMutationOptions } from "./optimistic-list"
import { createAppQueryClient } from "./query-client"

/**
 * 乐观列表配方的测试：每个用例挂独立 QueryClient，直接断言缓存。
 *
 * 断言的是**顺序与回滚**这两件「错了就静默坏」的事：请求还挂着时乐观值要已经可见、
 * 失败必须回到快照、落定后必须失效。提示文案不在这里测——它已经不属于本配方，
 * 而是 `createAppQueryClient()` 全局反馈的职责。
 */
function setup<TData, TVars>(
    config: Parameters<typeof optimisticListMutationOptions<TData, TVars>>[0],
    initialCache: Record<string, unknown> = {},
) {
    // 用真实工厂：meta.invalidates 要靠全局 MutationCache 落地，裸 QueryClient 测不到
    const queryClient = createAppQueryClient(createLocaleScope(), {
        queries: { retry: false },
        mutations: { retry: false },
    })
    for (const [key, value] of Object.entries(initialCache)) {
        queryClient.setQueryData([key], value)
    }
    const utils = renderHook(() => useMutation(optimisticListMutationOptions(config)), {
        wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
    })
    return { queryClient, ...utils }
}

describe("optimisticListMutationOptions", () => {
    it("成功：乐观值在请求落定前就可见，终态失效重取后仍是新值", async () => {
        let release!: () => void
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        const { result, queryClient } = setup<string, string>(
            {
                queryKey: ["list"],
                mutationFn: async (vars) => {
                    await gate
                    return { data: vars }
                },
                patch: (list, vars) => [...list, vars],
            },
            { list: ["a", "b"] },
        )

        act(() => result.current.mutate("c"))

        // 请求还挂着（onMutate 已跑完），乐观值已经在缓存里
        await waitFor(() => expect(queryClient.getQueryData(["list"])).toEqual(["a", "b", "c"]))
        expect(result.current.isPending).toBe(true)

        release()
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        await waitFor(() => expect(queryClient.getQueryData(["list"])).toEqual(["a", "b", "c"]))
    })

    it("mutationFn 抛错（SDK throwOnError 后的真实形状）时回滚缓存", async () => {
        const { result, queryClient } = setup<string, string>(
            {
                queryKey: ["list"],
                mutationFn: async () => {
                    // SDK 已配 throwOnError：非 2xx 归一成 ApiError 抛出，不存在「返回 { error }」的路径
                    throw { status: 409, detail: "冲突" }
                },
                patch: (list, vars) => [...list, vars],
            },
            { list: ["a"] },
        )

        act(() => result.current.mutate("x"))

        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(queryClient.getQueryData(["list"])).toEqual(["a"])
    })

    it("patch 把整表改坏时，失败也回到快照（回滚不依赖 patch 是否可逆）", async () => {
        const { result, queryClient } = setup<string, string>(
            {
                queryKey: ["list"],
                mutationFn: async () => {
                    throw { status: 500, detail: "服务器错误" }
                },
                patch: () => ["被错误 patch 覆盖的列表"],
            },
            { list: ["a"] },
        )

        act(() => result.current.mutate("x"))

        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(queryClient.getQueryData(["list"])).toEqual(["a"])
    })

    it("终态失效该列表自身与 meta.invalidates 里的关联缓存（如头部角标计数）", async () => {
        const { result, queryClient } = setup<string, string>(
            {
                queryKey: ["list"],
                mutationFn: async (vars) => ({ data: vars }),
                patch: (list, vars) => [...list, vars],
                meta: { invalidates: [["badge"]] },
            },
            { list: ["a"], badge: 1 },
        )

        act(() => result.current.mutate("b"))
        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        await waitFor(() => {
            expect(queryClient.getQueryState(["list"])?.isInvalidated).toBe(true)
            expect(queryClient.getQueryState(["badge"])?.isInvalidated).toBe(true)
        })
    })
})
