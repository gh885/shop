import { client } from "@shop/api"
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
            return new Response(
                JSON.stringify({ status: 401, code: "TOKEN_EXPIRED", detail: "登录已过期" }),
                {
                    status: 401,
                    headers: { "content-type": "application/json" },
                },
            )
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

/** 让下一次 fetch 直接抛：模拟「拿不到响应」那一层（断网 / 超时 / 取消三族都在这一层分） */
function stubReject(make: () => unknown) {
    vi.stubGlobal(
        "fetch",
        vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () => {
            throw make()
        }),
    )
}

beforeAll(() => {
    // 单例 client 只装配一次（重复 configure 会叠加拦截器）
    configureSdkClient(BASE, tokens)
})

beforeEach(() => {
    vi.clearAllMocks()
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe("传输层故障恢复", () => {
    it.each([408, 429, 502, 503, 504])("GET %i 重试后成功，响应仍可读取", async (status) => {
        const fetchMock = vi
            .fn<() => Promise<Response>>()
            .mockResolvedValueOnce(json(status, { status, detail: "暂不可用" }))
            .mockResolvedValueOnce(json(200, { ok: true }))
        vi.stubGlobal("fetch", fetchMock)
        await expect(client.get({ url: "/probe" })).resolves.toMatchObject({ data: { ok: true } })
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it("重试耗尽仍保留最终错误体，POST 不重试", async () => {
        const fetchMock = vi.fn<() => Promise<Response>>(async () =>
            json(503, {
                status: 503,
                detail: "暂不可用",
                code: "PROBE",
                requestId: "trace-probe",
            }),
        )
        vi.stubGlobal("fetch", fetchMock)
        await expect(client.get({ url: "/probe" })).rejects.toMatchObject({
            status: 503,
            code: "PROBE",
            requestId: "trace-probe",
        })
        expect(fetchMock).toHaveBeenCalledTimes(3)
        fetchMock.mockClear()
        await expect(AuthApi.logoutAll()).rejects.toMatchObject({ status: 503, code: "PROBE" })
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it.each(["refresh", "replay"])("%s 断网不伪装成登录过期", async (phase) => {
        let calls = 0
        vi.stubGlobal(
            "fetch",
            vi.fn<() => Promise<Response>>(async () => {
                calls++
                if (calls === 1)
                    return json(401, { status: 401, code: "TOKEN_EXPIRED", detail: "过期" })
                if (phase === "refresh" || calls === 3) throw new TypeError("Failed to fetch")
                return json(200, { accessToken: "at-new" })
            }),
        )
        await expect(AuthApi.logoutAll()).rejects.toMatchObject({
            status: 0,
            code: "NETWORK_ERROR",
        })
        expect(tokens.clear).not.toHaveBeenCalled()
    })

    it.each(["refresh", "replay"])("%s 悬挂在十秒后超时", async (phase) => {
        vi.useFakeTimers()
        let calls = 0
        vi.stubGlobal(
            "fetch",
            vi.fn<() => Promise<Response>>(async () => {
                calls++
                if (calls === 1)
                    return json(401, { status: 401, code: "TOKEN_EXPIRED", detail: "过期" })
                if (phase === "refresh" || calls === 3) return new Promise<Response>(() => {})
                return json(200, { accessToken: "at-new" })
            }),
        )
        const result = AuthApi.logoutAll().catch((error: unknown) => error)
        await vi.advanceTimersByTimeAsync(10_100)
        expect(await result).toMatchObject({ status: 0, code: "REQUEST_TIMEOUT" })
        expect(tokens.clear).not.toHaveBeenCalled()
    })

    it("刷新后重发成功，不把成功响应当错误解析", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn<() => Promise<Response>>()
                .mockResolvedValueOnce(
                    json(401, { status: 401, code: "TOKEN_EXPIRED", detail: "过期" }),
                )
                .mockResolvedValueOnce(json(200, { accessToken: "at-new" }))
                .mockResolvedValueOnce(json(200, { ok: true })),
        )
        await expect(client.get({ url: "/probe" })).resolves.toMatchObject({ data: { ok: true } })
    })
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
            return json(401, { status: 401, code: "TOKEN_EXPIRED", detail: "登录已过期" })
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
 * 401 的**重放边界**：只有令牌裁决（带 `TOKEN_EXPIRED` / `INVALID_TOKEN`）才进刷新流程。
 *
 * <p>此前这里只看状态码，于是任何 401 都会刷新一次并把原请求重发一次。改密时输错当前密码就是
 * 一个现成的反例：它也是 401，但没有任何令牌需要换，重放那次 POST 纯属副作用——**「刷一次再重放」
 * 的合法性建立在「发出 401 时请求还没有产生副作用」这条前提上**，而只看状态码等于把前提当巧合。
 * 后端那一侧由 `ErrorCodeVocabularyTest.401的两类与重放边界` 钉住（哪些文件能发哪一类）。
 */
describe("401 分两类：只有令牌裁决才刷新重放", () => {
    it("凭据类 401（未携带令牌裁决码）不刷新也不重放", async () => {
        const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
            async (input: RequestInfo | URL) => {
                const url =
                    typeof input === "string"
                        ? input
                        : input instanceof URL
                          ? input.href
                          : input.url
                if (url.includes("auth/refresh")) return json(200, { accessToken: "at-new" })
                return json(401, { status: 401, detail: "当前密码错误" })
            },
        )
        vi.stubGlobal("fetch", fetchMock)

        await expect(AuthApi.logoutAll()).rejects.toMatchObject({
            status: 401,
            detail: "当前密码错误",
        })
        // 只发了一次请求、一次刷新都没发、也没写新令牌——重放一次写请求正是这条要防的
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(tokens.set).not.toHaveBeenCalled()
        expect(tokens.clear).not.toHaveBeenCalled()
    })

    it("令牌裁决 401（带 TOKEN_EXPIRED）照旧刷新一次并重放", async () => {
        const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
            async (input: RequestInfo | URL) => {
                const url =
                    typeof input === "string"
                        ? input
                        : input instanceof URL
                          ? input.href
                          : input.url
                if (url.includes("auth/refresh")) return json(200, { accessToken: "at-new" })
                return json(401, { status: 401, code: "TOKEN_EXPIRED", detail: "登录已过期" })
            },
        )
        vi.stubGlobal("fetch", fetchMock)

        // 重放那一发仍是 401（这条只钉「刷新发生了 + 请求重发了」，不碰成功响应的形状）
        await expect(AuthApi.logoutAll()).rejects.toMatchObject({ status: 401 })
        expect(tokens.set).toHaveBeenCalledWith("at-new")
        // 原请求 + 刷新 + 重放，恰好三次
        expect(fetchMock).toHaveBeenCalledTimes(3)
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

/**
 * `params` 那一格与 `errors` 同理：拦截器不接回来，schema 就只是声明。
 * 少了它，地址上限的 `limit` 到不了 catalog，后端改 20 → 30 时前端无从得知。
 */
describe("归一化把 params 接回 ApiError", () => {
    it("400 响应体里的结构化上下文原样透出", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () =>
                json(400, {
                    status: 400,
                    detail: "最多保存 20 条收货地址",
                    code: "ADDRESS_LIMIT_EXCEEDED",
                    params: { limit: 20 },
                }),
            ),
        )

        await expect(AuthApi.logoutAll()).rejects.toMatchObject({
            status: 400,
            code: "ADDRESS_LIMIT_EXCEEDED",
            params: { limit: 20 },
        })
    })
})

/**
 * 拿不到响应的失败**分族**：断网 / 超时 / 取消此前共用一个 `status === 0` 分支，
 * 而这三件事的用户动作是互斥的——断网要检查连接、超时要重试、取消什么都不该说。
 * 更要紧的是那句 `detail` 其实到不了用户眼前（`errorTextPlan` 对没有码的 status 0 取的是
 * `appKit.error.network`「操作失败，请稍后重试」），所以三族当时是真的塌成了一句话。
 *
 * <p>`TimeoutError` 这个名字取自 ky（`errors/TimeoutError.js` 里 `name = 'TimeoutError'`），
 * 取消是 DOM 的 `AbortError`；本组测的是**分类这一支**，ky 会不会真抛这个名字由它的库保证。
 */
describe("无响应失败按 error.name 分族", () => {
    it("超时出 REQUEST_TIMEOUT，与断网分开（用户动作相反：重试 vs 检查连接）", async () => {
        stubReject(() => Object.assign(new Error("timeout"), { name: "TimeoutError" }))

        await expect(AuthApi.logoutAll()).rejects.toMatchObject({
            status: 0,
            code: "REQUEST_TIMEOUT",
            detail: "请求超时，请稍后重试",
        })
    })

    it("调用方取消出 REQUEST_ABORTED", async () => {
        stubReject(() => Object.assign(new Error("aborted"), { name: "AbortError" }))

        await expect(AuthApi.logoutAll()).rejects.toMatchObject({
            status: 0,
            code: "REQUEST_ABORTED",
            detail: "请求已取消",
        })
    })

    it("认不出的无响应失败一律算断网，不猜第四种", async () => {
        stubReject(() => new TypeError("Failed to fetch"))

        await expect(AuthApi.logoutAll()).rejects.toMatchObject({
            status: 0,
            code: "NETWORK_ERROR",
            detail: "网络错误，请检查连接",
        })
    })
})

/**
 * 错误响应形状的契约面（N3）：失败响应的形状由 OpenAPI 的 `ApiProblem` 声明
 * （后端 `infra/web/OpenApiConfig` 生成，`openapi/api-docs.json` 里可见，每个端点挂一条
 * `default` 响应指向它），拦截器拿生成物 `zApiProblem` 校验。
 *
 * <p>这一组守的是**降级的方向**：契约漂了只许往「保住原有信息」那一侧降，不能因为一格脏数据
 * 把 HTTP 状态码或 code 一起吞掉——那会让一个 403 看起来像「响应解析失败」，用户拿到的提示
 * 与实际原因完全对不上，排查时也失去了唯一的线索。
 */
describe("错误响应按 ApiProblem 契约校验", () => {
    /** 每个请求给一个全新的 Response（body 只能读一次），并把漂移日志收进 spy */
    let errorSpy: { mockRestore: () => void } | undefined

    function stubErrorResponse(make: () => Response) {
        vi.stubGlobal(
            "fetch",
            vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () => make()),
        )
        errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        return errorSpy
    }

    afterEach(() => {
        errorSpy?.mockRestore()
        errorSpy = undefined
    })

    it("后端新增一个未知扩展键：剥掉即可，不算契约漂移", async () => {
        const spy = stubErrorResponse(() =>
            json(409, {
                status: 409,
                detail: "店铺名已存在",
                code: "SHOP_NAME_TAKEN",
                someFutureField: { nested: true },
            }),
        )

        const promise = AuthApi.logoutAll()
        await expect(promise).rejects.toMatchObject({
            status: 409,
            detail: "店铺名已存在",
            code: "SHOP_NAME_TAKEN",
        })
        await expect(promise).rejects.not.toHaveProperty("someFutureField")
        // 前向兼容是刻意的：加一格扩展属性不该让旧客户端开始报警
        expect(spy).not.toHaveBeenCalled()
    })

    it("requestId 是 JSON null（MDC 里没有 trace_id）：照常解析，不降级", async () => {
        const spy = stubErrorResponse(() =>
            json(403, { status: 403, detail: "无权访问", requestId: null }),
        )

        await expect(AuthApi.logoutAll()).rejects.toMatchObject({
            status: 403,
            detail: "无权访问",
            requestId: undefined,
        })
        expect(spy).not.toHaveBeenCalled()
    })

    it("params 里混进对象：只丢那一格，code 与状态码必须保住", async () => {
        const spy = stubErrorResponse(() =>
            json(400, {
                status: 400,
                detail: "最多保存 20 条收货地址",
                code: "ADDRESS_LIMIT_EXCEEDED",
                params: { limit: 20, bad: { nested: true } },
            }),
        )

        await expect(AuthApi.logoutAll()).rejects.toMatchObject({
            status: 400,
            code: "ADDRESS_LIMIT_EXCEEDED",
            // 标量那一格救回来，脏的那格丢掉——不是整条 params 消失
            params: { limit: 20 },
        })
        expect(spy).toHaveBeenCalledWith(expect.stringContaining("错误响应契约校验失败"))
    })

    it("响应体根本不是 ProblemDetail（代理回了 HTML）：保留原始状态码，走通用句", async () => {
        const spy = stubErrorResponse(
            () =>
                new Response("<html>502 Bad Gateway</html>", {
                    status: 502,
                    headers: { "content-type": "text/html" },
                }),
        )

        await expect(AuthApi.logoutAll()).rejects.toMatchObject({
            status: 502,
            detail: "请求失败，请稍后重试",
        })
        expect(spy).toHaveBeenCalledWith(expect.stringContaining("错误响应契约校验失败"))
    })
})

it("刷新请求声明接收 JSON，不被 text() 改成 text/*", async () => {
    let accept: string | null = null
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
            const request = new Request(input)
            if (request.url.endsWith("/auth/refresh")) {
                accept = request.headers.get("accept")
                return accept === "application/json"
                    ? json(200, { accessToken: "at-new" })
                    : new Response(null, { status: 406 })
            }
            if (request.headers.get("authorization") === "Bearer at-new")
                return new Response(null, { status: 204 })
            return json(401, { status: 401, code: "TOKEN_EXPIRED", detail: "登录已过期" })
        }),
    )
    await AuthApi.logoutAll()
    expect(accept).toBe("application/json")
    expect(tokens.set).toHaveBeenCalledWith("at-new")
})
