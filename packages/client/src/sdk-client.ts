import { client, zApiProblem } from "@shop/api"
import {
    ClientFailureCodes,
    ErrorCodes,
    fieldErrorsOf,
    isApiError,
    isZodError,
    paramsOf,
    zodIssuesText,
    type ApiError,
    type ClientFailureCode,
} from "@shop/common/contract"
import { captureError, toRouteTemplate, track } from "@shop/monitoring"
import ky, { isHTTPError } from "ky"
import type { z } from "zod"

/** 生成 SDK 的 ky 传输装配：token 注入 / x-request-id / 401 自动 refresh 重放 / 410 复用裁决清态冒泡 / 错误归一成 ApiError；timeout 与幂等 GET 重试交 ky 原生。各 app 装配处调一次 configureSdkClient。 */

export interface TokenStore {
    get: () => string | null
    set: (token: string) => void
    /** 清空登录态，必给：410 重放裁决靠它就地登出；可选=漏实现的装配清态静默变 no-op。 */
    clear: () => void
}

export interface SdkClientOptions {
    /** 401 刷新端点（默认 C 端 auth/refresh）。可传函数且每次求值：卖家端一种装配住两种会话（店主/子账号刷新端点不同），写死会把子账号 401 送到店主端点。 */
    refreshPath?: string | (() => string)
    /** 打印每个请求的耗时日志（dev 用） */
    debug?: boolean
    /** 动态上下文头（如 seller 的 X-Shop-Id）：每次请求取值注入，空值不注入，业务显式同名头优先。 */
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

/** 扁平化 query 序列化：Spring 按扁平参数绑定，hey-api 默认 deepObject 的裸 `[ ]` 会被 Tomcat 拒成 400，这里拍平为顶层 k=v。 */
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

/** 契约漂移上报：dev 打完整 issues、生产打可 grep 锚点（不吞）。监控锚点仍是 GEN-28 的 api_contract_drift。 */
function reportContractDrift(
    error: Parameters<typeof zodIssuesText>[0],
    request: { method: string; url: string } | undefined,
    debug: boolean | undefined,
    kind = "响应",
): void {
    const where = request ? `${request.method} ${new URL(request.url).pathname}` : "(unknown)"
    const issues = zodIssuesText(error)
    if (debug) {
        console.warn(`[API] ${kind}契约校验失败 ${where}\n  ${issues}`, error.issues)
    } else {
        console.error(`[API] ${kind}契约校验失败 ${where} ${issues}`)
    }
    // 同一出口（GEN-28 锚点）：控制台给人看、这条给监控看；dev 的完整 issues 不删。
    captureError("api_contract_drift", null, { message: `${kind}契约校验失败 ${where} ${issues}` })
}

/** 后端错误体里可选的 code / requestId（不是字符串就当没有，不让脏字段漏进 ApiError） */
const optionalStringField = (error: object, field: string): string | undefined => {
    const value = (error as Record<string, unknown>)[field]
    return typeof value === "string" ? value : undefined
}

/** 无响应时分族：超时/断网/取消三族互斥（认不出的一律算断网，不猜第四种）；取消不计错误率。判据用 error.name（ky TimeoutError / DOM AbortError）。 */
function localFailure(error: unknown): { code: ClientFailureCode; detail: string } {
    const name =
        typeof error === "object" && error !== null ? Reflect.get(error, "name") : undefined
    if (name === "TimeoutError") {
        return { code: ClientFailureCodes.REQUEST_TIMEOUT, detail: "请求超时，请稍后重试" }
    }
    if (name === "AbortError") {
        return { code: ClientFailureCodes.REQUEST_ABORTED, detail: "请求已取消" }
    }
    return { code: ClientFailureCodes.NETWORK_ERROR, detail: "网络错误，请检查连接" }
}

/** 有响应的失败 → ApiError。错误体形状唯一来源 = OpenAPI 契约（zApiProblem）：先整份校验，过了直接用；没过只算形状漂移，报一条 drift 后退回逐格宽松解读。降级单向：脏 params/errors 不许吞 code/requestId，也不许换原始 HTTP 状态码。 */
function apiErrorFromResponse(
    response: { status: number },
    error: unknown,
    request: { method: string; url: string } | undefined,
    debug: boolean | undefined,
): ApiError {
    const parsed = zApiProblem.safeParse(error)
    if (parsed.success) {
        const body = parsed.data
        return {
            status: response.status,
            detail: body.detail,
            code: body.code,
            // requestId 契约里可空（无 trace_id 后端发 null）：null 归一到 undefined，这格只表示「有没有」
            requestId: body.requestId ?? undefined,
            // 空数组与「没有字段级信息」对调用方是同一件事，别让它变成两件事
            errors: body.errors?.length ? body.errors : undefined,
            params: body.params,
        } satisfies ApiError
    }

    reportContractDrift(parsed.error, request, debug, "错误响应")

    // 以下为宽松兜底：能救多少救多少，状态码一律保留
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
        // 422 那一发的字段级明细：契约校验没过时逐个挑，脏条目丢掉而不是让整格消失
        errors: fieldErrorsOf(error),
        // 结构化上下文（地址上限那条 `limit`）：与 errors 同理，丢了 catalog 就只能退回不带数字的占位
        params: paramsOf(error),
    } satisfies ApiError
}

export function configureSdkClient(
    baseUrl: string,
    tokens?: TokenStore,
    options?: SdkClientOptions,
) {
    const startTimes = new WeakMap<Request, number>()

    /** 接口事件上报：只取模板化路径不取完整 URL（query 含 token/手机号，隐私边界；模板化才有界）。成功与失败都全量报、都不采样。计失败：5xx、无 response（status 0）、2xx 契约漂移；4xx 也报，接收端按 status 分。 */
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

    /** 401 → 刷新：单飞，同一时刻只发一次 refresh、并发 401 共用结果。refresh token 一次一换（ACC-22），并发各刷会让第二次拿已被轮换的旧码：宽限期内后端按竞争给 401 不吊销（本请求冒泡假「登录已过期」），超宽限期判盗用 → 410 吊销全部设备会话。 */
    let refreshing: Promise<Refreshed> | undefined

    /** 当前会话该刷新的端点，唯一求值口：needsRefresh 与 maybeRefreshAndRetry 必须读同一个值，否则子账号会话下的刷新请求会被它自己再触发一次刷新。函数形态每次重求值，正因会话种类可在装配后改变。 */
    function currentRefreshPath(): string {
        const configured = options?.refreshPath
        const path = typeof configured === "function" ? configured() : configured
        return path ?? "auth/refresh"
    }

    function refreshOnce(refreshPath: string): Promise<Refreshed> {
        refreshing ??= doRefresh(refreshPath).finally(() => {
            refreshing = undefined
        })
        return refreshing
    }

    async function doRefresh(refreshPath: string): Promise<Refreshed> {
        try {
            const pending = ky(`${baseUrl || ""}/${refreshPath}`, {
                method: "POST",
                // text() 用于兼容错误体解析，不代表服务端返回文本；Ky 否则会发送 Accept: text/*。
                headers: { Accept: "application/json" },
                credentials: "include",
                timeout: TIMEOUT_MS,
                totalTimeout: TIMEOUT_MS,
                retry: 0,
                throwHttpErrors: false,
            })
            const text = await pending.text()
            const res = await pending
            if (!res.ok) {
                // 410 + REFRESH_TOKEN_REUSED = refresh 重放裁决：后端已吊销该主体全部设备会话 → 就地清登录态（省各端兜底）；响应体原样冒泡，toast 由消费方全局通道呈现（拦截器不直造 UI）。
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
        } catch (error) {
            // 刷新网络失败不是登录失效：SDK 外层仍持有原 401，先标记本地失败以免被它覆盖。
            throw { status: 0, ...localFailure(error) } satisfies ApiError
        }
    }

    /** debug 模式下打一行请求耗时；startTimes 里的 request 不存在时耗时记 0 */
    function logResponse(
        request: Request,
        response: Response,
        startTimes: WeakMap<Request, number>,
    ) {
        const start = startTimes.get(request)
        const ms = start ? Math.round(performance.now() - start) : 0
        const path = new URL(request.url).pathname
        console.log(
            `[API] ${request.method} ${path} ${response.status} ${ms}ms`,
            response.ok ? "" : response.statusText,
        )
    }

    /** 吊销裁决的同体 410：body 只能消费一次，并发请求各造一份 */
    function revokedResponse(body: string) {
        return new Response(body, {
            status: 410,
            headers: { "content-type": "application/json" },
        })
    }

    /** 401 刷新后重发原请求：重建 Request（原 body 已消费，从序列化结果取）；重发失败 → 本地错误冒泡。刷新成功重放的不计错误率（那种 401 是设计内）；重放仍非 2xx 由 error 拦截器按真实状态码报一次，这里不重复报。 */
    async function retryWithToken(
        request: Request,
        serializedBody: unknown,
        accessToken: string,
        signal: AbortSignal | null | undefined,
    ) {
        try {
            const headers = new Headers(request.headers)
            headers.set("Authorization", `Bearer ${accessToken}`)
            const retry = new Request(request.url, {
                method: request.method,
                headers,
                body: serializedBody as BodyInit | null,
                credentials: "include",
                signal,
            })
            return await ky(retry, {
                timeout: TIMEOUT_MS,
                totalTimeout: TIMEOUT_MS,
                retry: 0,
                throwHttpErrors: false,
            })
        } catch (error) {
            throw { status: 0, ...localFailure(error) } satisfies ApiError
        }
    }

    /** 令牌裁决的码：只有这两种 401 是「刷一次新令牌再重放」可能修好的（划分见 docs/error-codes.md §401）。凭据裁决（密码错/改密当前密码错/refresh 轮换冲突）刷新毫无意义，只看状态码会把它的 POST 白重放一遍。重放合法性取决于「发出 401 时请求还没有副作用」——这是契约不是巧合。 */
    const TOKEN_VERDICT_CODES: readonly string[] = [
        ErrorCodes.TOKEN_EXPIRED,
        ErrorCodes.INVALID_TOKEN,
    ]

    /** 这个 401 是不是令牌裁决（读响应体 code）。用 response.clone() 不读原响应：原 body 还要交上层归一化 ApiError，读掉就是 "Body is unusable"。读不出来（HTML/空体/无 code）一律当不是：宁可少刷也不把重放当默认。 */
    async function isTokenVerdict(response: Response): Promise<boolean> {
        try {
            const body: unknown = await response.clone().json()
            if (typeof body !== "object" || body === null) return false
            const code: unknown = Reflect.get(body, "code")
            return typeof code === "string" && TOKEN_VERDICT_CODES.includes(code)
        } catch {
            return false
        }
    }

    /** 这个响应要不要进 401 刷新流程：非 401 / 刷新请求本身 / 还没登录态 → 不用。刷新请求本身要排掉，否则刷新失败会递归地再触发一次刷新。 */
    function needsRefresh(response: Response, request: Request) {
        const path = new URL(request.url).pathname
        const refreshPath = currentRefreshPath()
        return response.status === 401 && Boolean(tokens) && path !== `/${refreshPath}`
    }

    /** 跑一轮「刷新 → 重发」；非 401 场景/非令牌裁决/刷没成/重发失败都返回 undefined（原响应冒泡，error 拦截器报）。 */
    async function maybeRefreshAndRetry(
        response: Response,
        request: Request,
        opts: { serializedBody?: unknown; signal?: AbortSignal | null },
    ) {
        if (!needsRefresh(response, request)) return undefined
        if (!(await isTokenVerdict(response))) return undefined
        const refreshPath = currentRefreshPath()
        const refreshed = await refreshOnce(refreshPath)
        if (!refreshed) return undefined
        // 吊销裁决：并发请求各拿一份同体 410（真实 Response 的 body 只能消费一次），谁先落地 toast 都是那句「全部设备已下线」
        if (!("accessToken" in refreshed)) return revokedResponse(refreshed.revokedBody)
        return retryWithToken(request, opts.serializedBody, refreshed.accessToken, opts.signal)
    }

    client.setConfig({
        baseUrl: baseUrl || "/",
        credentials: "include",
        querySerializer: flattenQuerySerializer,
        throwOnError: true,
        // ky v2 预读 body 填 HTTPError.data，hey-api 再读 text() 就 "Body is unusable"；beforeError 用 data 还原可读响应。不能全关抛错（否则 HTTP 重试也关了），401 留给正常响应路径。
        kyOptions: {
            throwHttpErrors: (status) => status !== 401,
            hooks: {
                beforeError: [
                    ({ error }) => {
                        if (isHTTPError(error)) {
                            error.response = new Response(
                                typeof error.data === "string"
                                    ? error.data
                                    : JSON.stringify(error.data),
                                {
                                    status: error.response.status,
                                    statusText: error.response.statusText,
                                    headers: error.response.headers,
                                },
                            )
                        }
                        return error
                    },
                ],
            },
        },
        // 超时/重试交给 ky 原生：与旧 fetch 版 fetchWithPolicy 等价
        timeout: TIMEOUT_MS,
        retry: {
            limit: RETRY_LIMIT,
            methods: [...RETRY_METHODS],
            statusCodes: [...RETRY_STATUSES],
            // 429 默认尊重 Retry-After 但 maxRetryAfter 默认 Infinity：后端回个大时刻 GET 会干等再重发。timeout 只卡单次拿响应、不卡重试前等待，这里封顶到与 timeout 同量级。
            maxRetryAfter: 10_000,
        },
    })

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

    // 响应后：日志 + 401 自动 refresh 并重发原请求（重发用原生 fetch，绕开 ky 避免拦截器递归）。分支密度高，拆成 needsRefresh + maybeRefreshAndRetry 两层。
    client.interceptors.response.use(async (response, request, opts) => {
        if (options?.debug) logResponse(request, response, startTimes)
        const retried = await maybeRefreshAndRetry(response, request, opts)
        if (retried) return retried
        // 非 401 刷新场景或刷没成都让原始响应冒泡；成功才在这报（401 不是 ok，天然不重复报）
        if (response.ok) reportApi(request, response.status)
        return response
    })

    // 错误归一化：SDK 调用方拿到的 error 即 ApiError。响应契约校验的 ZodError 也走这里（借 request 拿方法路径）。
    client.interceptors.error.use((error, response, request) => {
        if (isZodError(error)) return contractDriftError(error, response, request)
        // 刷新/重发发生在拿到 401 之后；其本地失败不能被旧 response 当作后端错误体。
        if (isApiError(error) && error.status === 0) {
            if (error.code !== ClientFailureCodes.REQUEST_ABORTED) {
                reportApi(request, 0, { message: error.code })
            }
            return error
        }
        if (response) {
            const apiError = apiErrorFromResponse(response, error, request, options?.debug)
            // 4xx 也报：多数是业务拒绝，接收端按 status 分列——突增往往说明前端传参出了 bug
            reportApi(request, response.status, {
                message: apiError.code,
                requestId: apiError.requestId,
            })
            return apiError
        }
        // 无 response = 拿不到响应，三族按 error.name 分开（断网 / 超时 / 取消），理由见 localFailure
        const failure = localFailure(error)
        // 取消不是失败：计进去就等于把「用户切了路由」报成接口故障（status 0 那条口径见 reportApi）
        if (failure.code !== ClientFailureCodes.REQUEST_ABORTED) {
            reportApi(request, 0, { message: failure.code })
        }
        return { status: 0, code: failure.code, detail: failure.detail } satisfies ApiError
    })

    /** 响应契约校验（zod responseValidator）失败的归一化：2xx 但数据对不上，见调用处注释。 */
    function contractDriftError(
        error: z.ZodError,
        response: Response | undefined,
        request: Request | undefined,
    ): ApiError {
        reportContractDrift(error, request, options?.debug)
        // 2xx 但契约漂移计为失败，状态码照实报 2xx 不编 5xx——接收端要能把它和真服务故障分开看
        reportApi(request, response?.status ?? 200, {
            message: ClientFailureCodes.RESPONSE_VALIDATION_FAILED,
        })
        return {
            status: response?.status ?? 200,
            detail: "响应数据不符合接口契约",
            code: ClientFailureCodes.RESPONSE_VALIDATION_FAILED,
        } satisfies ApiError
    }

    return client
}
