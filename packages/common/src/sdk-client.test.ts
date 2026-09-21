import { AuthApi } from "@shop/api/sdk"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { configureSdkClient, type TokenStore } from "./sdk-client"

/**
 * sdk-client 拦截器的 refresh 失败面契约（node 环境，fetch 全桩）：
 * - 410 + REFRESH_TOKEN_REUSED（refresh 重放裁决，后端已全端吊销）→ 清登录态 + 410 原样冒泡
 *   （detail 交给消费方全局错误通道 toast，拦截器只归一不展示）；
 * - 其它刷新失败维持既有 401 处理模式：原请求的 401 冒泡，不清登录态。
 */

const BASE = "http://api.test"

const tokens: TokenStore = {
    get: vi.fn<() => string | null>(() => "at-old"),
    set: vi.fn<(token: string) => void>(),
    clear: vi.fn<() => void>(),
}

/** 按 URL 路由的 fetch 桩工厂：原请求固定 401，refresh 按传入响应 */
function stubFetch(refreshResponse: () => Response) {
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
        async (input: RequestInfo | URL) => {
            const url =
                typeof input === "string" ? input : input instanceof URL ? input.href : input.url
            if (url.includes("auth/refresh")) {
                return refreshResponse()
            }
            return new Response(JSON.stringify({ status: 401, detail: "登录已过期" }), {
                status: 401,
                headers: { "content-type": "application/json" },
            })
        },
    )
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
}

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    })

beforeAll(() => {
    // 单例 client 只装配一次（重复 configure 会叠加拦截器）
    configureSdkClient(BASE, tokens)
})

beforeEach(() => {
    vi.clearAllMocks()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("refresh 遇 410 REFRESH_TOKEN_REUSED", () => {
    it("清登录态并冒泡 410 的 code 与 detail", async () => {
        stubFetch(() =>
            json(410, {
                status: 410,
                code: "REFRESH_TOKEN_REUSED",
                detail: "账号已在其他设备登录，您已被迫下线",
            }),
        )

        // AuthApi.logoutAll：任意需登录接口，先 401 触发拦截器刷新
        await expect(AuthApi.logoutAll()).rejects.toMatchObject({
            status: 410,
            code: "REFRESH_TOKEN_REUSED",
            detail: "账号已在其他设备登录，您已被迫下线",
        })
        expect(tokens.clear).toHaveBeenCalledTimes(1)
        expect(tokens.set).not.toHaveBeenCalled()
    })

    it("410 但非重放 code 不误清登录态，按原 401 冒泡", async () => {
        stubFetch(() => json(410, { status: 410, code: "SOMETHING_ELSE", detail: "资源已失效" }))

        await expect(AuthApi.logoutAll()).rejects.toMatchObject({ status: 401 })
        expect(tokens.clear).not.toHaveBeenCalled()
    })
})
