import { QueryClientProvider, useMutation } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vite-plus/test"

import { Toaster } from "@shop/ui-web"

import { createLocaleScope } from "../i18n/scope"
import type { MutationMeta } from "./mutation-meta"
import { createAppQueryClient } from "./query-client"

/**
 * 这组用例钉的是 `createAppQueryClient()` 的**写操作全局反馈**（`MutationCache`）。
 *
 * 用真实工厂 + 真实 `<Toaster />`，断言用户**看得见**的那条提示，而不是「`notify` 被调用了几次」
 * ——后者会把测试绑在实现上（toast 换实现就全红），而这里要守的恰恰是**呈现给用户的后果**；
 * 其中「只弹一条」是关键：同一件事一旦有两条提示互相覆盖，功能测试全绿而用户看到的是矛盾信息。
 *
 * 之所以必须用真实工厂：各 app 测试装置若用裸 `QueryClient` 建客户端，就不带这套
 * `MutationCache`，全局反馈在生产里一定生效、在测试里却走不到。
 */

const SETTLED = "idle-after-run"

function setup(
    mutationFn: () => Promise<unknown>,
    meta?: MutationMeta,
    /** 供「就地渲染错误」的写操作挂自己的 onError（全局 silentError 后仍要跑） */
    onError?: () => void,
) {
    const queryClient = createAppQueryClient(createLocaleScope("zh-CN"), {
        queries: { retry: false },
    })
    function Probe() {
        const mutation = useMutation({
            mutationFn,
            meta,
            onError,
            retry: false,
        })
        // 状态暴露到 DOM：等确定性信号（settled）而不是 sleep 或「等不到就一直等」
        return (
            <>
                <button
                    type="button"
                    onClick={() => mutation.mutate()}
                >
                    触发
                </button>
                {mutation.submittedAt > 0 && !mutation.isPending ? <span>{SETTLED}</span> : null}
            </>
        )
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Toaster />
            <Probe />
        </QueryClientProvider>,
    )
    return { queryClient }
}

const fire = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("button", { name: "触发" }))

/** 等 mutation 落定，用来断言「什么都没弹出」 */
const settle = () => waitFor(() => expect(screen.getByText(SETTLED)).toBeInTheDocument())

describe("createAppQueryClient 的写操作全局反馈", () => {
    it("失败默认弹提示，且后端 detail 优先于 meta.error 的兜底文案", async () => {
        const user = userEvent.setup()
        setup(
            async () => {
                throw { status: 409, detail: "该优惠券已领取" }
            },
            { error: "兜底文案不该出现" },
        )

        await fire(user)

        expect(await screen.findByText("该优惠券已领取")).toBeInTheDocument()
        expect(screen.queryByText("兜底文案不该出现")).not.toBeInTheDocument()
    })

    it("网络层错误（status 0）没有后端 detail，退回 meta.error 的场景文案", async () => {
        const user = userEvent.setup()
        setup(
            async () => {
                throw new Error("network down")
            },
            { error: "取消订单失败" },
        )

        await fire(user)

        expect(await screen.findByText("取消订单失败")).toBeInTheDocument()
    })

    it("meta.silentError 退出全局提示：就地处理错误的写操作不会先被弹一条", async () => {
        const user = userEvent.setup()
        let ownHandlerRan = false
        setup(
            async () => {
                throw { status: 409, detail: "该优惠券已领取" }
            },
            { silentError: true },
            () => {
                ownHandlerRan = true
            },
        )

        await fire(user)
        await settle()

        expect(screen.queryByText("该优惠券已领取")).not.toBeInTheDocument()
        // 全局回调先于逐点回调执行（官方 mutation.ts），被抑制时逐点 onError 照常跑
        expect(ownHandlerRan).toBe(true)
    })

    it("meta.success 才提示成功：不填即静默（高频操作不该刷屏）", async () => {
        const user = userEvent.setup()
        setup(async () => ({ ok: true }), { success: "订单已取消" })

        await fire(user)
        expect(await screen.findByText("订单已取消")).toBeInTheDocument()
    })

    it("不填 meta.success 时成功静默", async () => {
        const user = userEvent.setup()
        setup(async () => ({ ok: true }))

        await fire(user)
        await settle()

        expect(screen.queryByText("订单已取消")).not.toBeInTheDocument()
    })

    it("meta.invalidates 按前缀失效真实 query key（一发命中整棵子树）", async () => {
        const user = userEvent.setup()
        const { queryClient } = setup(async () => ({ ok: true }), {
            invalidates: [["my-orders"]],
        })
        // 同前缀的另一格缓存：前缀匹配应当把它一起标脏
        queryClient.setQueryData(["my-orders", "all", 1, 20], { records: [] })

        await fire(user)
        await settle()

        expect(queryClient.getQueryState(["my-orders", "all", 1, 20])?.isInvalidated).toBe(true)
    })
})
