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
    /**
     * 401 自动刷新的端点（相对路径；默认 C 端 auth/refresh，admin 端传 admin/auth/refresh）。
     *
     * 允许传函数，且**每次判定/调用时求值**：卖家端一个装配里住着两种会话（店主与店铺子账号，
     * 刷新端点不同），而装配只发生一次、会话却会随登录切换——写死字符串就等于把子账号的 401
     * 送到店主的刷新端点上。传字符串的那两端（web / admin）行为不变。
     */
    refreshPath?: string | (() => string)
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

/**
 * 契约漂移的上报：dev 打完整 issues 尽早暴露，生产只打可 grep 的锚点（不吞）。
 *
 * <p>{@code kind} 区分漂的是哪一侧——「2xx 的响应体不合契约」和「失败响应不合契约」是两种
 * 完全不同的 bug（前者多半是后端改了字段，后者多半是异常处理器或某个过滤器另写了一份），
 * 混在一个计数里就分不出来。监控锚点仍是 GEN-28 定的那一个 {@code api_contract_drift}。
 */
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
    // 同一个出口（GEN-28 定的锚点）：控制台那行给人看，这条给监控看。
    // 只进监控不删控制台——删了那行在 dev 里最有用的现场（完整 issues）就没了
    captureError("api_contract_drift", null, { message: `${kind}契约校验失败 ${where} ${issues}` })
}

/** 后端错误体里可选的 code / requestId（不是字符串就当没有，不让脏字段漏进 ApiError） */
const optionalStringField = (error: object, field: string): string | undefined => {
    const value = (error as Record<string, unknown>)[field]
    return typeof value === "string" ? value : undefined
}

/**
 * 没有响应可解读时的分族。
 *
 * <p>此前这一支把所有「没有 response」压成同一句 `网络错误，请检查连接`，而那三件事的用户动作
 * 是**互斥**的：断网要检查连接、10 秒超时要重试、调用方取消什么都不该说。更糟的是那句 detail
 * 其实到不了用户眼前（`errorTextPlan` 对 `status === 0` 取的是 `error.network`
 * 「操作失败，请稍后重试」，不读 detail），所以三族是真的塌成了一句通用文案。
 *
 * <p>取消那一族今天还会**污染接口错误率**：TanStack Query 的 signal 透传进 SDK（web 的 feed
 * 与商品详情取数都传了），于是每次切路由 / 换页取消在途请求都被记成一次网络失败。
 *
 * <p>判据用 `error.name`：ky 的 `TimeoutError` 自带这个名字，取消是 DOM 的 `AbortError`。
 * **认不出的一律算断网**，不猜第四种——认错方向只是提示不贴切，漏判则是这条失败不进错误率。
 */
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

/**
 * 有响应的失败 → ApiError。**错误体形状的唯一来源现在是 OpenAPI 契约**：
 * `infra/web/OpenApiConfig` 把 `ApiProblem` 声明进 `components.schemas`，并给每个端点挂了一条
 * `default` 响应指向它（`application/problem+json`），前端拿到的 `zApiProblem` 就是那份声明。
 *
 * <p>校验分两层，顺序不能反：
 *
 * <ol>
 *   <li><b>先按契约整份校验。</b>过了就直接用——生成物是 `z.object`，声明之外的键默认剥掉，
 *       所以「白名单重建」那一步由它承担，不用再手写一遍。
 *   <li><b>没过不等于「这条错误读不出来了」</b>，只是形状漂了：报一条 drift，然后退回逐格宽松
 *       解读（本函数一直以来的行为）。
 * </ol>
 *
 * <p>降级必须是单向的（这条是本节最容易被写反的地方）：一个 `params` 里混进对象、或 `errors`
 * 里混进一条缺 `message` 的脏记录，**不许**把整条错误的 `code` / `requestId` 一起吞掉，更不许
 * 把原始 HTTP 状态码换掉。代理返回 HTML、空响应体、后端多给一个未知扩展键，走的都是这一层。
 */
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
            // requestId 在契约里是可空的（MDC 里没有 trace_id 时后端就是发 null）：
            // 这里把 null 归一到 undefined，ApiError 那格只表示「有没有」这一件事
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

    /**
     * 接口事件上报（首批功能「接口」条）。
     *
     * 只取**路径**不取完整 URL：query 里可能有 token、手机号、搜索词（契约第 5 条隐私边界），
     * 而路径模板化后才有界——`/api/shops/12345/coupons` 每个店一条，进指标标签就是无界基数。
     *
     * 成功与失败**都全量报**（都带耗时）：失败是分母里必须准的那部分。
     * 采样只作用于性能事件（`MonitoringOptions.sampleRate` 的定义就是「性能事件采样率」），
     * api 事件从不采样——所以这里没有抽样，别把它跟性能那套混为一谈。
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

    /**
     * 当前会话该刷新的端点。**唯一求值口**：`needsRefresh`（判「这个请求本身就是刷新请求」）与
     * `maybeRefreshAndRetry`（真去刷）必须读同一个值，否则子账号会话下的刷新请求会被它自己
     * 再触发一次刷新。
     *
     * 函数形态每次调用都重新求值，正因为会话种类可以在装配之后改变。
     */
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

    /**
     * 401 刷新后重发原请求：重建 Request（原 body 已消费，从序列化结果取）。
     * 重发本身失败 → 本地网络/超时/取消错误冒泡（会在 error 拦截器里报）。
     * 401 刷新后重放成功的不计（首批「接口」条：那种 401 是设计内的，不该拉高错误率）；
     * 重放仍非 2xx 的由 error 拦截器报一次（带重放后的真实状态码，不是最初的 401），
     * 这里不重复报——同一请求报两次会让错误率直接翻倍。
     */
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

    /**
     * 令牌裁决的码：**只有**这两种 401 是「刷一次新令牌再重放」可能修好的。
     *
     * 后端把 401 分成两类（`docs/error-codes.md` §401 的两类与重放边界）：
     * - **令牌裁决**（带这两个码）：这个请求没有可用的 access token，换一个新的就能继续；
     * - **凭据裁决**（不带码）：登录密码错、改密的当前密码错、refresh 轮换冲突——刷新对它毫无意义。
     *
     * 此前这里只看状态码，于是任何 401 都会触发一次刷新 + 一次重放：改密时输错当前密码，
     * 会白白刷一次令牌并把那次 POST 再发一遍。这不是效率问题——**重放的合法性取决于
     * 「发出 401 时请求还没有产生副作用」**，而只看状态码就等于把这个前提当成巧合而不是契约。
     */
    const TOKEN_VERDICT_CODES: readonly string[] = [
        ErrorCodes.TOKEN_EXPIRED,
        ErrorCodes.INVALID_TOKEN,
    ]

    /**
     * 这个 401 是不是令牌裁决（读响应体里的 code）。
     *
     * 用 `response.clone()` 而不是读原响应：原 body 还要交给上层（error 拦截器要拿它归一化
     * ApiError），读掉了就是 "Body is unusable"——这个坑在本文件里已经踩过一次（见下面
     * `kyOptions.throwHttpErrors` 那段注释）。
     *
     * 读不出来（代理回 HTML、空响应体、没有 code）一律当**不是**令牌裁决：刷新的收益是
     * 「少一次重新登录」，代价是「多发一次写请求」，宁可少刷也不要把重放当默认。
     */
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

    /**
     * 这个响应要不要进 401 刷新流程：非 401 / 刷新请求本身 / 还没登录态 → 不用。
     * 刷新请求本身要排掉，否则刷新失败会递归地再触发一次刷新。
     */
    function needsRefresh(response: Response, request: Request) {
        const path = new URL(request.url).pathname
        const refreshPath = currentRefreshPath()
        return response.status === 401 && Boolean(tokens) && path !== `/${refreshPath}`
    }

    /**
     * 跑一轮「刷新 → 重发」。不属于 401 场景、不是令牌裁决、刷没成、重发失败，都返回 undefined
     * （原响应冒泡，会在 error 拦截器里报）。
     */
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
        // 吊销裁决：并发请求各拿一份同体的 410（真实 Response 的 body 只能消费一次），
        // 谁先落地 toast 都是后端那句「全部设备已下线」
        if (!("accessToken" in refreshed)) return revokedResponse(refreshed.revokedBody)
        return retryWithToken(request, opts.serializedBody, refreshed.accessToken, opts.signal)
    }

    client.setConfig({
        baseUrl: baseUrl || "/",
        credentials: "include",
        querySerializer: flattenQuerySerializer,
        throwOnError: true,
        // ky v2 在 throwHttpErrors 时会预读响应 body 填 HTTPError.data，导致 hey-api
        // 的 parseErrorResponse 再读 response.text() 时报 "Body is unusable"。
        // 最终抛错前用 data 还原可读响应；不能全关抛错，否则 HTTP 重试也会被关闭。
        // 401 留给正常响应路径：hey-api 的 HTTPError catch 即使刷新成功也会按错误解析。
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
            // 429 默认就尊重 Retry-After（ky 的 afterStatusCodes 含它），但 maxRetryAfter
            // 默认 Infinity：后端回个大时刻时，GET 会干等那一刻再重发。timeout 只卡单次
            // 拿响应、不卡重试前的等待，这里封顶到与 timeout 同量级——超了就放弃重发。
            maxRetryAfter: 10_000,
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
    // 这一段的分支密度高（判定要不要刷 / 刷没刷成 / 吊销裁决 / 重发 / 重发失败各自一口），
    // 所以拆成 needsRefresh + maybeRefreshAndRetry 两层：健康扫描按
    // 「cc>=5 且零覆盖必上榜」判（CRAP 退化成 cc²+cc），不拆就会一直红。
    client.interceptors.response.use(async (response, request, opts) => {
        if (options?.debug) logResponse(request, response, startTimes)
        const retried = await maybeRefreshAndRetry(response, request, opts)
        if (retried) return retried
        // 走到这里要么本来就不是 401 刷新场景，要么刷没成。两种都让原始响应冒泡；
        // 成功才在这里报（401 本身不是 ok，天然不会重复报）
        if (response.ok) reportApi(request, response.status)
        return response
    })

    // 错误归一化：SDK 调用方拿到的 error 即 ApiError
    // 响应契约校验（zod responseValidator）抛出的 ZodError 也走这里：
    // 客户端 catch 后会送进 error 拦截器，借 request 拿到方法与路径。
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
        // 2xx 但契约漂移：计为失败（首批「接口」条），状态码照实报 2xx 而不是编一个 5xx——
        // 接收端要能把它和真失败分开看，它指向的是前后端契约没对上，不是服务挂了
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
