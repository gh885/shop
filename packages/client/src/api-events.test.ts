import { AuthApi } from "@shop/api/sdk"
import { createMonitor, flushMonitoring } from "@shop/monitoring"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { configureSdkClient, type TokenStore } from "./sdk-client"

/**
 * 接口事件上报的契约（node 环境，fetch 全桩）。
 *
 * 三条最容易写错、且错了不会报错只会让看板说谎的：
 * 1. **成功只报一次**：响应拦截器与错误拦截器都会经过，不对称就会一条请求报两条 → 错误率翻倍
 * 2. **失败只报一次**：非 2xx 由错误拦截器统一报；响应拦截器只在 `response.ok` 时报成功
 * 3. **endpoint 是模板不是实际路径**：`/shops/12345/coupons` 每个店一条，进指标标签就是无界基数
 *
 * 这里用注入的假「最后一跳」断言「发了什么」，不碰真网络——被测的是 sdk-client 这半的接线，
 * 所以测试跟着装配住在 `@shop/client`；出口自己的传输细节由 `@shop/monitoring` 的 transport.ts 测。
 */

interface SentEvent {
    kind: string
    endpoint?: string
    method?: string
    status?: number
    duration?: number
    message?: string
}

const sent: SentEvent[] = []

/**
 * 假「最后一跳」。出口攒够一批或 flush 时才调它，body 是**事件对象数组**
 * （不是字符串数组——双重编码会让 body 大一倍）。
 */
const send = (_endpoint: string, body: string): boolean => {
    for (const event of JSON.parse(body) as SentEvent[]) sent.push(event)
    return true
}

const tokens: TokenStore = {
    get: () => "at",
    set: () => {},
    clear: () => {},
}

beforeAll(() => {
    // 单例 client 只装配一次（重复 configure 会叠加拦截器）
    configureSdkClient("http://api.test", tokens)
})

beforeEach(() => {
    sent.length = 0
    // 不装默认插件：测试里不要挂真的 window 监听，jsdom 自身的错误会污染断言
    createMonitor({ app: "web", enabled: true, send, integrations: () => [] })
    vi.stubGlobal(
        "fetch",
        vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
            async () =>
                // 合法的 MeResponse（id 必须是 uuid，否则会走契约漂移分支而不是成功分支）
                new Response(
                    JSON.stringify({
                        id: "3f1a7c9e-5b2d-4e8a-9c1f-2d6b8a4e7f30",
                        phone: "13800138000",
                        nickname: "买家",
                        avatarKey: null,
                        preferredLocale: null,
                    }),
                    { status: 200, headers: { "content-type": "application/json" } },
                ),
        ),
    )
})

describe("接口事件", () => {
    it("成功请求报一条：endpoint 是模板、状态码真实、带耗时", async () => {
        await AuthApi.me()
        flushMonitoring()

        const api = sent.filter((e) => e.kind === "api")
        expect(api).toHaveLength(1)
        expect(api[0]?.method).toBe("GET")
        expect(api[0]?.status).toBe(200)
        // 真实路径模板化后不含任何 id 段
        expect(api[0]?.endpoint).toBe("/auth/me")
        expect(typeof api[0]?.duration).toBe("number")
    })

    it("关掉总开关就不发：接收端没上线时白发事件是纯噪声", async () => {
        createMonitor({ app: "web", enabled: false, send, integrations: () => [] })
        await AuthApi.me()
        flushMonitoring()
        expect(sent.filter((e) => e.kind === "api")).toHaveLength(0)
    })

    it("5xx 只报一次且带真实状态码：响应与错误两个拦截器都经过，重复报会让错误率翻倍", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
                async () =>
                    new Response(JSON.stringify({ status: 503, detail: "服务不可用" }), {
                        status: 503,
                        headers: { "content-type": "application/json" },
                    }),
            ),
        )
        // 用 toBeDefined 而非 toThrow：抛出来的是归一化后的 ApiError 对象而非 Error 实例，
        // 而本例要钉的是「失败只报一条、状态码照实」，不是错误文案
        await expect(AuthApi.me()).rejects.toBeDefined()
        flushMonitoring()

        const api = sent.filter((e) => e.kind === "api")
        expect(api).toHaveLength(1)
        expect(api[0]?.status).toBe(503)
    })

    it("拿不到响应的失败报一条 status 0，标签是分族后的码（不是自由文本）", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () => {
                throw new TypeError("Failed to fetch")
            }),
        )
        await expect(AuthApi.logoutAll()).rejects.toBeDefined()
        flushMonitoring()

        const api = sent.filter((e) => e.kind === "api")
        expect(api).toHaveLength(1)
        expect(api[0]?.status).toBe(0)
        // 有界的码才配进指标标签；此前这里是自由文本「网络错误」，超时与断网还共用它
        expect(api[0]?.message).toBe("NETWORK_ERROR")
    })

    it("调用方取消（AbortError）一条都不报：切路由不是接口故障", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () => {
                // TanStack Query 的 signal 透传进 SDK 后取消在途请求就是这个名字
                throw Object.assign(new Error("aborted"), { name: "AbortError" })
            }),
        )
        await expect(AuthApi.logoutAll()).rejects.toBeDefined()
        flushMonitoring()

        expect(sent.filter((e) => e.kind === "api")).toHaveLength(0)
    })
})
