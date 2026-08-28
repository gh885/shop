import type { ApiError } from "./common"
import { client } from "./sdk/client.gen"

/**
 * 生成 SDK（src/sdk）的传输层装配：给 hey-api 生成的默认 client 挂上
 * 与 ky 版 `createApiClient` 等价的拦截 —— token 注入、Correlation ID、
 * 401 自动 refresh 重试、错误归一化为 ApiError、10s 超时、GET 自动重试。
 *
 * 各 app 在装配处调用一次（模块初始化）：
 *   configureSdkClient("", tokenStore, { debug: import.meta.env.DEV })
 * 之后业务代码直接用生成的具名方法：`CartApi.getCartItems()`，
 * 返回值 { data, error } 中 error 即归一化后的 ApiError。
 */

export interface TokenStore {
    get: () => string | null
    set: (token: string) => void
}

const startTimes = new WeakMap<Request, number>()

// ---- 超时 + GET 重试（对齐 ky 版：timeout 10s；GET 遇 408/429/5xx 重试 2 次） ----

const TIMEOUT_MS = 10_000
const RETRY_LIMIT = 2
const RETRY_STATUSES = new Set([408, 429, 502, 503, 504])

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const fetchWithPolicy: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    // 仅 GET 自动重试（幂等）；非 GET 一次直达
    const maxAttempts = request.method === "GET" ? RETRY_LIMIT + 1 : 1

    for (let attempt = 1; ; attempt++) {
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)])
        try {
            // 每次重试重新 clone，避免 body/信号被上次消费
            const response = await globalThis.fetch(new Request(request, { signal }))
            if (attempt >= maxAttempts || !RETRY_STATUSES.has(response.status)) {
                return response
            }
        } catch (error) {
            if (attempt >= maxAttempts) throw error
        }
        await sleep(300 * attempt)
    }
}

export interface SdkClientOptions {
    /** 401 自动刷新的端点（相对路径；默认 C 端 auth/refresh，admin 端传 admin/auth/refresh） */
    refreshPath?: string
    /** 打印每个请求的耗时日志（dev 用） */
    debug?: boolean
}

export function configureSdkClient(
    baseUrl: string,
    tokens?: TokenStore,
    options?: SdkClientOptions,
) {
    client.setConfig({
        baseUrl: baseUrl || "/",
        credentials: "include",
        fetch: fetchWithPolicy,
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
            return await (opts.fetch ?? globalThis.fetch)(retry)
        } catch {
            // refresh 失败 → 原始 401 正常冒泡
            return response
        }
    })

    // ---- 错误归一化：与 ky 版 toApiError 同一出口语义，SDK 调用方拿到的 error 即 ApiError ----
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
