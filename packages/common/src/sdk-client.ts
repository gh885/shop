import { client } from "@shop/api"

import type { ApiError } from "./api-error"
import { isZodError, RESPONSE_VALIDATION_FAILED, zodIssuesText } from "./api-error"
import { ErrorCodes } from "./error-codes"
import { captureError, toRouteTemplate, track } from "./monitoring"

/**
 * 生成 SDK（@shop/api）的传输层装配：给 hey-api 生成的 ky client 挂上
 * 拦截 —— token 注入、请求 ID（x-request-id）、401 自动 refresh 重发、
 * refresh 遇 410 REFRESH_TOKEN_REUSED 清登录态并冒泡、错误归一化为
 * ApiError；超时与（幂等 GET）重试直接交给 ky 原生能力，不再手写 fetch 策略。
 *
 * 各 app 在装配处调用一次（模块初始化）：
 *   configureSdkClient("", tokenStore, { debug: import.meta.env.DEV })
 * 之后业务代码直接用生成的具名方法：`CartApi.getCartItems()`。
 *
 * 传输层用 @hey-api/client-ky：依赖已有的 `ky`，其原生 `timeout`/`retry`
 * 替代了手写的 fetchWithPolicy。错误契约不变 —— throwOnError: true 时，
 * 出错即抛归一化后的 ApiError（经 error 拦截器），成功直接返回数据。
 */

export interface TokenStore {
    get: () => string | null
    set: (token: string) => void
    /**
     * 清空登录态。必给：410 重放裁决靠它就地登出，可选就意味着某个装配漏实现时
     * 后端已经吊销了全部会话、前端还自以为登录着（清态静默变成 no-op）。
     */
    clear: () => void
}

export interface SdkClientOptions {
    /** 401 自动刷新的端点（相对路径；默认 C 端 auth/refresh，admin 端传 admin/auth/refresh） */
    refreshPath?: string
    /** 打印每个请求的耗时日志（dev 用） */
    debug?: boolean
    /**
     * 动态上下文头（如 seller 的 X-Shop-Id 当前店铺）：每次请求时取值注入，
     * 值为空不注入；业务显式传入的同名头优先（不覆盖）。
     */
    contextHeaders?: () => Record<string, string | undefined>
}

// 超时 + 重试（对齐原 ky 版/之前的 fetch 版策略：timeout 10s；仅幂等 GET 遇 408/429/5xx 重试 2 次）
const TIMEOUT_MS = 10_000
const RETRY_LIMIT = 2
const RETRY_METHODS = ["GET"] as const
const RETRY_STATUSES = [408, 429, 502, 503, 504]

/** 401 刷新的三种结局：换新 token / 会话被吊销（带 410 响应体）/ 没刷上（undefined = 原 401 冒泡） */
type Refreshed = { accessToken: string } | { revokedBody: string } | undefined

/** 从 JSON 文本取一个顶层字符串字段：解析不出来或不是字符串都给 undefined（不猜形状） */
const jsonStringField = (text: string, field: string): string | undefined => {
    try {
        const parsed: unknown = JSON.parse(text)
        if (typeof parsed !== "object" || parsed === null) return undefined
        // 用 Reflect.get 而不是 as Record：JSON.parse 的返回是 any，断言过去等于给自己发通行证
        const value: unknown = Reflect.get(parsed, field)
        return typeof value === "string" ? value : undefined
    } catch {
        return undefined
    }
}

/**
 * 扁平化 query 序列化：Spring 模块入参多为 `@Valid XxxQuery`（如 PageParams/ProductQuery），
 * 实际按扁平参数绑定（page/size/categoryId/sort...）。而 hey-api 默认把对象参数序列化成
 * deepObject（`query[sort]=newest`，裸 `[ ]`），Tomcat 默认拒绝裸括号 → 直接 400。
 * 这里把对象/数组拍平为顶层 `k=v`，贴合 Spring 绑定，也避免裸括号。
 */
const flattenQuerySerializer = (query: Record<string, unknown>): string => {
    const search: string[] = []
    const push = (key: string, value: unknown) => {
        if (value === undefined || value === null) return
        if (Array.isArray(value)) {
            value.forEach((v) => push(key, v))
        } else if (typeof value === "object") {
            Object.entries(value).forEach(([k, v]) => push(k, v))
        } else if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
        ) {
            search.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        }
    }
    for (const [k, v] of Object.entries(query)) push(k, v)
    return search.join("&")
}

/** 契约漂移的上报：dev 打完整 issues 尽早暴露，生产只打可 grep 的锚点（不吞） */
function reportContractDrift(
    error: Parameters<typeof zodIssuesText>[0],
    request: { method: string; url: string } | undefined,
    debug: boolean | undefined,
): void {
    const where = request ? `${request.method} ${new URL(request.url).pathname}` : "(unknown)"
    const issues = zodIssuesText(error)
    if (debug) {
        console.warn(`[API] 响应契约校验失败 ${where}\n  ${issues}`, error.issues)
    } else {
        console.error(`[API] 响应契约校验失败 ${where} ${issues}`)
    }
    // 同一个出口（GEN-28 定的锚点）：控制台那行给人看，这条给监控看。
    // 只进监控不删控制台——删了那行在 dev 里最有用的现场（完整 issues）就没了
    captureError("api_contract_drift", null, { message: `响应契约校验失败 ${where} ${issues}` })
}

/** 后端错误体里可选的 code / requestId（不是字符串就当没有，不让脏字段漏进 ApiError） */
const optionalStringField = (error: object, field: string): string | undefined => {
    const value = (error as Record<string, unknown>)[field]
    return typeof value === "string" ? value : undefined
}

/** 有响应的失败：后端给了 detail 就原样透出（含 code/requestId 供前端分流），否则给一句通用重试 */
function apiErrorFromResponse(response: { status: number }, error: unknown): ApiError {
    if (typeof error !== "object" || error === null || !("detail" in error)) {
        return { status: response.status, detail: "请求失败，请稍后重试" } satisfies ApiError
    }
    const detail = error.detail
    if (typeof detail !== "string") {
        return { status: response.status, detail: "请求失败，请稍后重试" } satisfies ApiError
    }
    return {
        status: response.status,
        detail,
        code: optionalStringField(error, "code"),
        requestId: optionalStringField(error, "requestId"),
    } satisfies ApiError
}

export function configureSdkClient(
    baseUrl: string,
    tokens?: TokenStore,
    options?: SdkClientOptions,
) {
    const startTimes = new WeakMap<Request, number>()

    /**
     * 接口事件上报（首批功能「接口」条）。
     *
     * 只取**路径**不取完整 URL：query 里可能有 token、手机号、搜索词（契约第 5 条隐私边界），
     * 而路径模板化后才有界——`/api/shops/12345/coupons` 每个店一条，进指标标签就是无界基数。
     *
     * 失败全报、成功按会话采样报（带耗时）：失败是分母里必须准的那部分；成功量太大，
     * 按会话抽样足够看出延迟分布（同一会话内要么全报要么全不报，见 core 的 sampledSession）。
     *
     * 计为失败的是：5xx、网络层失败（无 response → status 0）、以及 2xx 但契约漂移。
     * 4xx 多数是业务拒绝，同样上报但接收端按 status 分开看——突增往往是前端传参出了 bug。
     */
    const reportApi = (
        request: Request | undefined,
        status: number,
        extra: { message?: string; requestId?: string } = {},
    ): void => {
        // 无 request（极少见，但拦截器签名允许）就没什么可报的：连 endpoint 都取不到
        if (!request) return
        const start = startTimes.get(request)
        track({
            kind: "api",
            endpoint: toRouteTemplate(new URL(request.url).pathname),
            method: request.method,
            status,
            duration: start ? Math.round(performance.now() - start) : 0,
            message: extra.message,
            requestId: extra.requestId,
        })
    }

    /**
     * 401 → 刷新：单飞。同一时刻只发一次 refresh，并发 401 共用结果。
     *
     * refresh token 一次一换（ACC-22），并发 401 各刷一次就是让第二次提交去拿已被轮换掉的旧码：
     * 15 秒宽限期内后端按多标签页竞争给 401 不吊销 —— 那一次刷新算失败，兄弟请求早已换到新 token，
     * 本请求却只能冒泡一个假的「登录已过期」；超出宽限期就判成盗用 → 410 吊销该主体全部设备会话。
     * 两种都不是用户该看到的：工作台首屏并发几个查询，恰好是最容易凑齐并发的场景。
     * （auth-kit 的 bootstrapAuth 早就去重了，这条 401 路径此前没有。）
     */
    let refreshing: Promise<Refreshed> | undefined

    function refreshOnce(refreshPath: string): Promise<Refreshed> {
        refreshing ??= doRefresh(refreshPath).finally(() => {
            refreshing = undefined
        })
        return refreshing
    }

    async function doRefresh(refreshPath: string): Promise<Refreshed> {
        try {
            const res = await fetch(`${baseUrl || ""}/${refreshPath}`, {
                method: "POST",
                credentials: "include",
            })
            const text = await res.text()
            if (!res.ok) {
                // 410 + REFRESH_TOKEN_REUSED = refresh 重放裁决：后端已吊销该主体全部设备会话。
                // 就地清登录态（与「401 冒泡后消费方兜底清态」同效，省得各端再补一遍），响应体交回
                // 调用方原样冒泡 —— 其 detail（「全部设备已下线」）经错误拦截器归一成 ApiError，
                // toast 由消费方全局错误通道呈现，拦截器不直造 UI。
                if (
                    res.status !== 410 ||
                    jsonStringField(text, "code") !== ErrorCodes.REFRESH_TOKEN_REUSED
                ) {
                    return undefined
                }
                tokens?.clear()
                return { revokedBody: text }
            }
            const accessToken = jsonStringField(text, "accessToken")
            if (!accessToken) return undefined
            // 写入只做这一次：并发等待者各自 set 一遍，就是拿同一个 token 反复通知订阅者
            tokens?.set(accessToken)
            return { accessToken }
        } catch {
            // 刷新请求本身失败（网络/解析）→ 当作没刷上
            return undefined
        }
    }

    client.setConfig({
        baseUrl: baseUrl || "/",
        credentials: "include",
        querySerializer: flattenQuerySerializer,
        throwOnError: true,
        // ky v2 在 throwHttpErrors 时会预读响应 body 填 HTTPError.data，导致 hey-api
        // 的 parseErrorResponse 再读 response.text() 时报 "Body is unusable"。
        // 关闭 ky 自己的抛错，让 hey-api 的 error interceptor 统一读取并归一化 ApiError。
        kyOptions: { throwHttpErrors: false },
        // 超时/重试交给 ky 原生：与旧 fetch 版 fetchWithPolicy 等价
        timeout: TIMEOUT_MS,
        retry: {
            limit: RETRY_LIMIT,
            methods: [...RETRY_METHODS],
            statusCodes: [...RETRY_STATUSES],
        },
    })

    // 请求前：token + 请求 ID（x-request-id） + 计时起点
    client.interceptors.request.use((request) => {
        const token = tokens?.get()
        if (token) {
            request.headers.set("Authorization", `Bearer ${token}`)
        }
        // 后端 RequestIdFilter 只认 x-request-id，且要求 32 位 hex（不合法它会自生成）
        if (!request.headers.has("x-request-id")) {
            request.headers.set("x-request-id", crypto.randomUUID().replaceAll("-", ""))
        }
        const contextHeaders = options?.contextHeaders?.()
        if (contextHeaders) {
            for (const [name, value] of Object.entries(contextHeaders)) {
                if (value && !request.headers.has(name)) {
                    request.headers.set(name, value)
                }
            }
        }
        startTimes.set(request, performance.now())
        return request
    })

    // 响应后：日志 + 401 自动 refresh 并重发原请求
    // 401 重发用原生 fetch（request.url 已含 baseUrl），绕过 ky 避免触发拦截器递归。
    client.interceptors.response.use(async (response, request, opts) => {
        const path = new URL(request.url).pathname
        if (options?.debug) {
            const start = startTimes.get(request)
            const ms = start ? Math.round(performance.now() - start) : 0
            console.log(
                `[API] ${request.method} ${path} ${response.status} ${ms}ms`,
                response.ok ? "" : response.statusText,
            )
        }

        const refreshPath = options?.refreshPath ?? "auth/refresh"
        if (response.status !== 401 || !tokens || path === `/${refreshPath}`) {
            // 成功才在这里报：非 2xx 会被 hey-api 抛出去、在 error 拦截器里报（避免一条请求报两次）
            if (response.ok) reportApi(request, response.status)
            return response
        }

        const refreshed = await refreshOnce(refreshPath)
        if (!refreshed) {
            // 刷新没成（cookie 过期）→ 原始 401 正常冒泡（会在 error 拦截器里报）
            return response
        }
        if (!("accessToken" in refreshed)) {
            // 吊销裁决：并发请求各拿一份同体的 410（真实 Response 的 body 只能消费一次），
            // 谁先落地 toast 都是后端那句「全部设备已下线」。
            return new Response(refreshed.revokedBody, {
                status: 410,
                headers: { "content-type": "application/json" },
            })
        }

        try {
            // 重发原请求：重建 Request（原 body 已消费，从序列化结果取）
            const headers = new Headers(request.headers)
            headers.set("Authorization", `Bearer ${refreshed.accessToken}`)
            const retry = new Request(request.url, {
                method: request.method,
                headers,
                body: opts.serializedBody,
                credentials: request.credentials,
                signal: request.signal,
            })
            // 401 刷新后重放成功的不计（首批「接口」条：那种 401 是设计内的，不该拉高错误率）；
            // 重放仍非 2xx 的由下面的 error 拦截器报一次（带重放后的真实状态码，不是最初的 401），
            // 这里不重复报——同一请求报两次会让错误率直接翻倍
            return await fetch(retry)
        } catch {
            // 重发本身失败 → 原始 401 冒泡（会在 error 拦截器里报）
            return response
        }
    })

    // 错误归一化：SDK 调用方拿到的 error 即 ApiError
    // 响应契约校验（zod responseValidator）抛出的 ZodError 也走这里：
    // 客户端 catch 后会送进 error 拦截器，借 request 拿到方法与路径。
    client.interceptors.error.use((error, response, request) => {
        if (isZodError(error)) {
            reportContractDrift(error, request, options?.debug)
            // 2xx 但契约漂移：计为失败（首批「接口」条），状态码照实报 2xx 而不是编一个 5xx——
            // 接收端要能把它和真失败分开看，它指向的是前后端契约没对上，不是服务挂了
            reportApi(request, response?.status ?? 200, { message: RESPONSE_VALIDATION_FAILED })
            return {
                status: response?.status ?? 200,
                detail: "响应数据不符合接口契约",
                code: RESPONSE_VALIDATION_FAILED,
            } satisfies ApiError
        }
        if (response) {
            const apiError = apiErrorFromResponse(response, error)
            // 4xx 也报：多数是业务拒绝，接收端按 status 分列——突增往往说明前端传参出了 bug
            reportApi(request, response.status, {
                message: apiError.code,
                requestId: apiError.requestId,
            })
            return apiError
        }
        // 无 response = 网络层失败（断网 / CORS / DNS）：status 0，与 4xx 不是一回事
        reportApi(request, 0, { message: "网络错误" })
        return { status: 0, detail: "网络错误，请检查连接" } satisfies ApiError
    })

    return client
}
