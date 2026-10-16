import { messageFactFactory } from "@shop/i18n"
import { QueryClientProvider, useMutation } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vite-plus/test"

import type { I18nResources } from "@shop/i18n"
import { Toaster } from "@shop/ui-web"

import { createAppI18n } from "../i18n/runtime"
import type { MutationMeta } from "./mutation-meta"
import { createAppQueryClient } from "./query-client"

/** 钉 createAppQueryClient 的写反馈（MutationCache）：断言用户看得见的 toast、不是「notify 调了几次」；必须用真实工厂，裸 QueryClient 不带这套 MutationCache、测不到 */

const SETTLED = "idle-after-run"

function setup(
    mutationFn: () => Promise<unknown>,
    meta?: MutationMeta,
    /** 供「就地渲染错误」的写操作挂自己的 onError（全局 silentError 后仍要跑） */
    onError?: () => void,
    resources?: I18nResources,
) {
    const i18n = createAppI18n("zh-Hans-CN", resources)
    const queryClient = createAppQueryClient(i18n, {
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
    return { queryClient, i18n }
}

const fire = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("button", { name: "触发" }))

const settle = () => waitFor(() => expect(screen.getByText(SETTLED)).toBeInTheDocument())

describe("createAppQueryClient 的写操作全局反馈", () => {
    it("失败默认弹提示，且后端 detail 优先于 meta.error 的兜底文案", async () => {
        const user = userEvent.setup()
        setup(
            async () => {
                throw { status: 409, detail: "该优惠券已领取" }
            },
            { error: message("t.fallback") },
            undefined,
            { "zh-Hans-CN": { "t.fallback": "兜底文案不该出现" } },
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
            { error: message("t.net") },
            undefined,
            { "zh-Hans-CN": { "t.net": "取消订单失败" } },
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
        setup(async () => ({ ok: true }), { success: message("t.ok") }, undefined, {
            "zh-Hans-CN": { "t.ok": "订单已取消" },
        })

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

    it("meta.success 用消息事实：句子按注入 catalog + 当前语言现取（不再是裸串）", async () => {
        const user = userEvent.setup()
        setup(async () => ({ ok: true }), { success: message("toast.saved") }, undefined, {
            "zh-Hans-CN": { "toast.saved": "已保存" },
            "en-US": { "toast.saved": "Saved" },
        })

        await fire(user)
        expect(await screen.findByText("已保存")).toBeInTheDocument()
    })

    it("决定性：切语言后下一条 toast 用新语言——存 key 而非急翻译才做得到", async () => {
        const user = userEvent.setup()
        const { i18n } = setup(
            async () => ({ ok: true }),
            { success: message("toast.savedItems", { n: 3 }) },
            undefined,
            {
                "zh-Hans-CN": { "toast.savedItems": "已保存 {n} 项" },
                "en-US": { "toast.savedItems": "Saved {n} items" },
            },
        )

        await fire(user)
        expect(await screen.findByText("已保存 3 项")).toBeInTheDocument()

        // 翻转注入的 i18n：MutationCache 在 onSuccess 那一刻现读 locale，故下一条是新语言；急翻译则永远停在中文
        void i18n.changeLanguage("en-US")
        await fire(user)
        expect(await screen.findByText("Saved 3 items")).toBeInTheDocument()
    })

    it("meta.error 用消息事实：网络层错误退回按语言现取的兜底句", async () => {
        const user = userEvent.setup()
        setup(
            async () => {
                throw new Error("network down")
            },
            { error: message("toast.err") },
            undefined,
            { "zh-Hans-CN": { "toast.err": "保存失败" }, "en-US": { "toast.err": "Save failed" } },
        )

        await fire(user)
        expect(await screen.findByText("保存失败")).toBeInTheDocument()
    })
})

type FixtureKey = "t.fallback" | "t.net" | "t.ok" | "toast.saved" | "toast.savedItems" | "toast.err"
const message = messageFactFactory<FixtureKey, { "toast.savedItems": { n: number } }>()
