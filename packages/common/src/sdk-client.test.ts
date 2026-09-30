import { AuthApi } from "@shop/api/sdk"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { configureSdkClient, type TokenStore } from "./sdk-client"

/**
 * sdk-client 拦截器的 refresh 失败面契约（node 环境，fetch 全桩）：
 * - 410 + REFRESH_TOKEN_REUSED（refresh 重放裁决，后端已全端吊销）→ 清登录态 + 410 原样冒泡
 *   （detail 交给消费方全局错误通道 toast，拦截器只归一不展示）；
 * - 其它刷新失败维持既有 401 处理模式：原请求的 401 冒泡，不清登录态；
 * - 并发 401 共用一次刷新（refresh token 一次性轮换，各刷一次 = 第二次起全被判重放）。
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

/**
 * 并发 401（首屏多个查询同时到期）：refresh 必须只发一次。
 * refresh token 一次一换（ACC-22），各刷一次就是让第二次提交拿已被轮换掉的旧码 ——
 * 宽限期内后端回 401（那次刷新白做，请求跟着冒泡假的「登录已过期」），
 * 超出宽限期判盗用 → 410 吊销该主体全部设备会话（真下线）。
 */
function stubSlowRefresh(response: () => Response) {
    const refreshCalls: string[] = []
    vi.stubGlobal(
        "fetch",
        vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async (input: RequestInfo | URL) => {
            const url =
                typeof input === "string" ? input : input instanceof URL ? input.href : input.url
            if (url.includes("auth/refresh")) {
                refreshCalls.push(url)
                // 挂住一会儿：让其余并发请求都到达拦截器，这才叫并发
                await new Promise((resolve) => setTimeout(resolve, 20))
                return response()
            }
            return json(401, { status: 401, detail: "登录已过期" })
        }),
    )
    return () => refreshCalls.length
}

describe("并发 401 的刷新单飞", () => {
    it("三个请求同时 401 只刷一次，各自拿新 token 重发", async () => {
        const calls = stubSlowRefresh(() => json(200, { accessToken: "at-new" }))

        await Promise.allSettled([AuthApi.logoutAll(), AuthApi.logoutAll(), AuthApi.logoutAll()])

        expect(calls()).toBe(1)
        expect(tokens.set).toHaveBeenCalledTimes(1)
        expect(tokens.set).toHaveBeenCalledWith("at-new")
        expect(tokens.clear).not.toHaveBeenCalled()
    })

    it("刷新被判吊销：每个并发请求都拿到同一句 410 detail，不因响应体被抢读而退化", async () => {
        const calls = stubSlowRefresh(() =>
            json(410, {
                status: 410,
                code: "REFRESH_TOKEN_REUSED",
                detail: "账号已在其他设备登录，您已被迫下线",
            }),
        )

        const errors = await Promise.all([
            AuthApi.logoutAll().catch((error: unknown) => error),
            AuthApi.logoutAll().catch((error: unknown) => error),
        ])

        expect(calls()).toBe(1)
        expect(tokens.clear).toHaveBeenCalledTimes(1)
        for (const error of errors) {
            expect(error).toMatchObject({
                status: 410,
                code: "REFRESH_TOKEN_REUSED",
                detail: "账号已在其他设备登录，您已被迫下线",
            })
        }
    })
})

/**
 * 错误归一化的字段级明细面：后端 422 把 `errors: [{field, message}]` 挂在 ProblemDetail 的扩展属性上，
 * `ApiErrorSchema` 也声明了它。拦截器不接回来的话，这一格就是「schema 说有、运行时永远没有」——
 * 调用方按 `err.errors` 标红输入框会静静地拿不到东西（本仓此前正是这个状态）。
 */
describe("归一化把 errors 接回 ApiError", () => {
    it("422 响应体里的字段级明细原样透出", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () =>
                json(422, {
                    status: 422,
                    detail: "输入校验失败（1 个字段错误）",
                    errors: [{ field: "name", message: "商品标题最长 30 字" }],
                }),
            ),
        )

        await expect(AuthApi.logoutAll()).rejects.toMatchObject({
            status: 422,
            errors: [{ field: "name", message: "商品标题最长 30 字" }],
        })
    })
})
