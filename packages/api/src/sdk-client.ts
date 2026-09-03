import type { ApiError } from "./common"
import { client } from "./sdk/client.gen"

/**
 * 生成 SDK（src/sdk）的传输层装配：给 hey-api 生成的 ky client 挂上
 * 拦截 —— token 注入、Correlation ID、401 自动 refresh 重发、错误归一化为
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
}

export interface SdkClientOptions {
    /** 401 自动刷新的端点（相对路径；默认 C 端 auth/refresh，admin 端传 admin/auth/refresh） */
    refreshPath?: string
    /** 打印每个请求的耗时日志（dev 用） */
    debug?: boolean
}

// ---- 超时 + 重试（对齐原 ky 版/之前的 fetch 版策略：timeout 10s；仅幂等 GET 遇 408/429/5xx 重试 2 次） ----

const TIMEOUT_MS = 10_000
const RETRY_LIMIT = 2
const RETRY_METHODS = ["GET"] as const
const RETRY_STATUSES = [408, 429, 502, 503, 504]

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
            Object.entries(value as Record<string, unknown>).forEach(([k, v]) => push(k, v))
        } else {
            search.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        }
    }
    for (const [k, v] of Object.entries(query ?? {})) push(k, v)
    return search.join("&")
}

export function configureSdkClient(
    baseUrl: string,
    tokens?: TokenStore,
    options?: SdkClientOptions,
) {
    const startTimes = new WeakMap<Request, number>()

    client.setConfig({
        baseUrl: baseUrl || "/",
        credentials: "include",
        querySerializer: flattenQuerySerializer,
        throwOnError: true,
        // 超时/重试交给 ky 原生：与旧 fetch 版 fetchWithPolicy 等价
        timeout: TIMEOUT_MS,
        retry: {
            limit: RETRY_LIMIT,
            methods: [...RETRY_METHODS],
            statusCodes: [...RETRY_STATUSES],
        },
    })

    // ---- 请求前：token + 全链路 ID + 计时起点 ----
    client.interceptors.request.use((request) => {
        const token = tokens?.get()
        if (token) {
            request.headers.set("Authorization", `Bearer ${token}`)
        }
        if (!request.headers.has("X-Correlation-Id")) {
            request.headers.set("X-Correlation-Id", crypto.randomUUID())
        }
        startTimes.set(request, performance.now())
        return request
    })

    // ---- 响应后：日志 + 401 自动 refresh 并重发原请求 ----
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
            return response
        }

        try {
            const prefix = baseUrl || ""
            const res = await fetch(`${prefix}/${refreshPath}`, {
                method: "POST",
                credentials: "include",
            })
            if (!res.ok) return response
            const { accessToken } = (await res.json()) as { accessToken: string }
            tokens.set(accessToken)

            // 重发原请求：重建 Request（原 body 已消费，从序列化结果取）
            const headers = new Headers(request.headers)
            headers.set("Authorization", `Bearer ${accessToken}`)
            const retry = new Request(request.url, {
                method: request.method,
                headers,
                body: opts.serializedBody,
                credentials: request.credentials,
                signal: request.signal,
            })
            return await fetch(retry)
        } catch {
            // refresh 失败 → 原始 401 正常冒泡
            return response
        }
    })

    // ---- 错误归一化：SDK 调用方拿到的 error 即 ApiError ----
    client.interceptors.error.use((error, response) => {
        if (response) {
            const body = error as Partial<ApiError> | undefined
            if (body && typeof body === "object" && typeof body.detail === "string") {
                return {
                    status: response.status,
                    detail: body.detail,
                    code: body.code,
                    requestId: body.requestId,
                } satisfies ApiError
            }
            return { status: response.status, detail: "请求失败，请稍后重试" } satisfies ApiError
        }
        return { status: 0, detail: "网络错误，请检查连接" } satisfies ApiError
    })

    return client
}
