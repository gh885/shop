import { createMonitor, flushMonitoring } from "@shop/monitoring"
import { describe, expect, it } from "vite-plus/test"

import { submitForm } from "./submit-form"

/**
 * `submitForm` —— 表单提交的唯一出口。
 *
 * 钉的是**两类错误分开处理**这条唯一理由：
 * - 错误体形状的那一类（后端 / 网络）已经由全局写操作反馈提示过，这里再报就是两次提示 → 静默；
 * - 其余一切（TypeError 之类，代码坏了）走不到 `meta.error`，吞掉 = 「用户点了提交什么都没发生」
 *   且监控无痕 → 必须上报。
 *
 * 三个用例共用一个**异步**装配：上报队列是模块级单例，装配不 await 完就拆，
 * 断言会在监控已经关掉之后才跑，于是「应该上报」那条永远收到 0 条——而
 * 「不该上报」那两条还会因为同一个原因假绿。
 */
describe("submitForm", () => {
    async function withMonitoring(
        run: (ctx: {
            sent: { kind: string; message?: string }[]
            /** 队列攒到 20 条或转后台才发，断言前必须显式 flush（与 notify.test 同一口径） */
            flush: () => void
        }) => Promise<void>,
    ): Promise<void> {
        const sent: { kind: string; message?: string }[] = []
        // 假「最后一跳」。body 是事件对象数组（不是字符串数组——双重编码会让 body 大一倍）
        const send = (_endpoint: string, body: string): boolean => {
            for (const event of JSON.parse(body) as { kind: string; message?: string }[]) {
                sent.push(event)
            }
            return true
        }
        // 不装默认插件：测试里不要挂真的 window 监听，jsdom 自身的错误会污染断言
        createMonitor({ app: "web", enabled: true, send, integrations: () => [] })
        try {
            await run({ sent, flush: flushMonitoring })
        } finally {
            flushMonitoring()
            createMonitor({ app: "web", enabled: false, send, integrations: () => [] })
        }
    }

    const errors = (sent: { kind: string; message?: string }[]) =>
        sent.filter((e) => e.kind === "error")

    const apiError = {
        status: 400,
        detail: "最多保存 20 条收货地址",
        code: "ADDRESS_LIMIT_EXCEEDED",
    }

    it("提交成功：什么也不报", async () => {
        await withMonitoring(async ({ sent, flush }) => {
            await submitForm({ handleSubmit: () => Promise.resolve("ok") })
            flush()
            expect(errors(sent)).toHaveLength(0)
        })
    })

    it("接口错误：静默（提示已由全局写操作反馈发过，再报就是两次）", async () => {
        await withMonitoring(async ({ sent, flush }) => {
            await submitForm({ handleSubmit: () => Promise.reject(apiError) })
            flush()
            expect(errors(sent)).toHaveLength(0)
        })
    })

    it("非接口错误：上报监控（这是它存在的理由，吞掉就等于「点了没反应」）", async () => {
        await withMonitoring(async ({ sent, flush }) => {
            await submitForm({
                handleSubmit: () => Promise.reject(new TypeError("x is not a function")),
            })
            flush()
            expect(errors(sent).length).toBeGreaterThan(0)
            expect(
                errors(sent)
                    .map((e) => e.message)
                    .join("|"),
            ).toContain("表单提交失败")
        })
    })

    it("永远不 reject：返回值给 void 用是安全的", async () => {
        await withMonitoring(async () => {
            await expect(
                submitForm({ handleSubmit: () => Promise.reject(new RangeError("boom")) }),
            ).resolves.toBeUndefined()
        })
    })
})
