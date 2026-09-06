import { QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useOptimisticListMutation } from "./use-optimistic-list"

import { createTestQueryClient } from "@shop/test-utils"

/**
 * 乐观列表 mutation 工厂测试：每个用例挂独立 QueryClient，直接断言缓存。
 * 不 mock notify——失败场景只关心「缓存回滚」，提示文案由 notify 自己的行为保证。
 */
function setup<TData, TVars>(
    options: Parameters<typeof useOptimisticListMutation<TData, TVars>>[0],
    initialCache: Record<string, unknown> = {},
) {
    const queryClient = createTestQueryClient()
    for (const [key, value] of Object.entries(initialCache)) {
        queryClient.setQueryData([key], value)
    }
    const utils = renderHook(() => useOptimisticListMutation(options), {
        wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
    })
    return { queryClient, ...utils }
}

describe("useOptimisticListMutation", () => {
    it("成功：乐观 patch 先生效，终态失效重取后仍包含新条目", async () => {
        const { result, queryClient } = setup<string, string>(
            {
                queryKey: ["list"],
                mutationFn: async (vars) => ({ data: vars }),
                patch: (list, vars) => [...list, vars],
                messages: { error: "操作失败" },
            },
            { list: ["a", "b"] },
        )

        act(() => result.current.mutate("c"))
        // 乐观 patch 在 mutation 落定前就可见
        await waitFor(() => expect(queryClient.getQueryData(["list"])).toEqual(["a", "b", "c"]))

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        await waitFor(() => expect(queryClient.getQueryData(["list"])).toEqual(["a", "b", "c"]))
    })

    it("mutationFn 返回 { error }（SDK 未抛错形态）时提升为异常并回滚缓存", async () => {
        const { result, queryClient } = setup<string, string>(
            {
                queryKey: ["list"],
                mutationFn: async () => ({ error: { status: 409, detail: "冲突" } }),
                patch: (list, vars) => [...list, vars],
                messages: { error: "操作失败" },
            },
            { list: ["a"] },
        )

        act(() => result.current.mutate("x"))

        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(queryClient.getQueryData(["list"])).toEqual(["a"])
    })

    it("mutationFn 直接抛错时同样回滚缓存", async () => {
        const { result, queryClient } = setup<string, string>(
            {
                queryKey: ["list"],
                mutationFn: async () => {
                    throw { status: 500, detail: "服务器错误" }
                },
                patch: () => ["被错误 patch 覆盖的列表"],
                messages: { error: "操作失败" },
            },
            { list: ["a"] },
        )

        act(() => result.current.mutate("x"))

        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(queryClient.getQueryData(["list"])).toEqual(["a"])
    })

    it("终态连带失效 invalidateKeys（如头部角标计数）", async () => {
        const { result, queryClient } = setup<string, string>(
            {
                queryKey: ["list"],
                invalidateKeys: [["badge"]],
                mutationFn: async (vars) => ({ data: vars }),
                patch: (list, vars) => [...list, vars],
                messages: { error: "操作失败" },
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
