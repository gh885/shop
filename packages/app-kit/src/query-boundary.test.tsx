import {
    QueryClientProvider,
    QueryErrorResetBoundary,
    queryOptions,
    useQueryErrorResetBoundary,
    useSuspenseQuery,
} from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { createTestQueryClient } from "@shop/test-utils"

import { QueryBoundary } from "./query-boundary"
import { RouteErrorFallback } from "./route-error-fallback"

/**
 * 这组用例钉的是**官方重置链路**，不是样式：
 * suspense 查询抛错 → 错误边界接住 → 边界 `onReset` 调 `QueryErrorResetBoundary.reset`
 * → 重挂载后查询重新取数。这条链断在哪一环，「重试」按钮都会变成死按钮，
 * 而它在肉眼上只表现为「点了没反应」，所以必须有测试守着。
 */

const KEY = ["query-boundary-probe"] as const

/** 第一次失败、之后成功的查询；计数用来断言「重试真的重新发了请求」 */
function makeFlakyProbe() {
    let calls = 0
    const queryFn = async (): Promise<{ ok: boolean }> => {
        calls++
        if (calls === 1) throw new Error("boom")
        return { ok: true }
    }
    function Probe() {
        const { data } = useSuspenseQuery(queryOptions({ queryKey: KEY, queryFn, retry: false }))
        return <span>data:{String(data.ok)}</span>
    }
    return { Probe, calls: () => calls }
}

/** 挂起中的查询：手动放行，用来断言 pending 占位真的出现过。
 *  手写 deferred 而不用 `Promise.withResolvers`：它要 lib ES2024，本仓 tsconfig 统一停在 ES2023。 */
function makeDeferredProbe() {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
        release = resolve
    })
    const queryFn = async (): Promise<{ ok: boolean }> => {
        await gate
        return { ok: true }
    }
    function Probe() {
        const { data } = useSuspenseQuery(
            queryOptions({ queryKey: ["query-boundary-deferred"], queryFn }),
        )
        return <span>data:{String(data.ok)}</span>
    }
    return { Probe, release: () => release() }
}

describe("QueryBoundary", () => {
    it("suspense 查询失败落到 fallback，点重试后走官方 reset 重新取数并出内容", async () => {
        const { Probe, calls } = makeFlakyProbe()
        const user = userEvent.setup()

        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <QueryBoundary
                    pending={<span>加载中</span>}
                    fallback={({ error, reset }) => (
                        <div>
                            <span role="alert">
                                {error instanceof Error ? error.message : "未知错误"}
                            </span>
                            <button
                                type="button"
                                onClick={reset}
                            >
                                重试
                            </button>
                        </div>
                    )}
                >
                    <Probe />
                </QueryBoundary>
            </QueryClientProvider>,
        )

        expect(await screen.findByRole("alert")).toHaveTextContent("boom")
        expect(calls()).toBe(1)

        await user.click(screen.getByRole("button", { name: "重试" }))

        await waitFor(() => expect(screen.getByText("data:true")).toBeInTheDocument())
        expect(calls()).toBe(2)
    })

    it("挂起期间显示 pending 占位（区块级流式：数据到位后替换为内容）", async () => {
        const { Probe, release } = makeDeferredProbe()

        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <QueryBoundary
                    pending={<span>加载中</span>}
                    fallback={() => <span role="alert">失败</span>}
                >
                    <Probe />
                </QueryBoundary>
            </QueryClientProvider>,
        )

        expect(screen.getByText("加载中")).toBeInTheDocument()

        release()
        expect(await screen.findByText("data:true")).toBeInTheDocument()
        expect(screen.queryByText("加载中")).not.toBeInTheDocument()
    })
})

describe("RouteErrorFallback", () => {
    it("重试同时重置 Router 边界与 Query 错误标记（缺后者时 suspense 查询不会重取）", async () => {
        const routerResets: number[] = []
        let queryResetFlag = false
        const user = userEvent.setup()

        /** 读到的是官方 QueryErrorResetBoundary 的标志位：RouteErrorFallback 必须已经把它翻起来 */
        function ResetFlagProbe() {
            const { isReset } = useQueryErrorResetBoundary()
            return (
                <button
                    type="button"
                    onClick={() => {
                        queryResetFlag = isReset()
                    }}
                >
                    读重置标志
                </button>
            )
        }

        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <QueryErrorResetBoundary>
                    <RouteErrorFallback
                        error={new Error("订单加载失败")}
                        reset={() => routerResets.push(1)}
                    />
                    <ResetFlagProbe />
                </QueryErrorResetBoundary>
            </QueryClientProvider>,
        )

        expect(screen.getByText("订单加载失败")).toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "重试" }))
        expect(routerResets).toHaveLength(1)

        await user.click(screen.getByRole("button", { name: "读重置标志" }))
        expect(queryResetFlag).toBe(true)
    })
})
