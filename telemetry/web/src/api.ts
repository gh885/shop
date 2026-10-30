/**
 * 平台前端的取数层。规则同 shop 三端：**组件里不裸 fetch**，服务端状态统一走 TanStack Query。
 * 这里没有引 `@shop/client`——那会变成 telemetry → shop 的依赖，搬家时要剥离。
 */

export type IssueSummary = {
    id: number
    title: string
    culprit: string | null
    level: string | null
    status: string
    firstSeen: string
    lastSeen: string
    eventCount: number
    releaseFirst: string | null
    releaseLast: string | null
    tenantId: string | null
}

export type ReadableFrame = {
    file: string
    function: string | null
    line: number
    column: number
    inApp: boolean
    source: string
}

/** status 必须能区分"没上传"和"上传了不匹配"——否则界面上只能说"堆栈看不懂"。
 * `NOT_NEEDED` = 原生栈（Java/.NET），本来就可读，不出提示。 */
export type SymbolicatedStack = {
    status: "OK" | "NOT_NEEDED" | "NO_DEBUG_ID" | "NO_SOURCEMAP" | "NO_FRAMES"
    frames: ReadableFrame[]
}

export type EventDetail = {
    id: number
    eventId: string
    receivedAt: string
    occurredAt: string
    issueId: number | null
    kind: string
    level: string | null
    platform: string | null
    release: string | null
    environment: string | null
    transaction: string | null
    tenantId: string | null
    traceId: string | null
    spanId: string | null
    payload: unknown
    stack: SymbolicatedStack
}

/** trace 视图的一个节点。已拍平 + 带 depth：前端渲染只是一个 map，缩进由 depth 决定。 */
export type TraceSpan = {
    spanId: string
    parentSpanId: string | null
    depth: number
    kind: "transaction" | "span" | "error"
    op: string | null
    description: string
    service: string | null
    transaction: string | null
    status: string | null
    /** 相对 trace 起点的毫秒偏移：时间条直接用它，前端不再做时钟换算 */
    startedAtMs: number
    durationMs: number
    level: string | null
    eventId: number | null
}

export type TraceGraph = {
    traceId: string
    startedAt: string
    durationMs: number
    services: string[]
    errorCount: number
    spans: TraceSpan[]
}

/**
 * 默认同源：开发期由 Vite 代理转发到 8090，生产期由 api 进程直接托管静态资源。
 * 只有"前端单独部署到别的域名"时才需要 VITE_TELEMETRY_API_BASE。
 */
const baseUrl = import.meta.env.VITE_TELEMETRY_API_BASE ?? ""

/** M0 只有一个项目（relay 的本地 properties 里那个）。多项目是 M2 的事。 */
export const projectId = "1"

async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`)
    if (!response.ok) {
        throw new Error(`${path} → HTTP ${response.status}`)
    }
    return (await response.json()) as T
}

export const api = {
    issues: () => getJson<IssueSummary[]>(`/api/${projectId}/issues?limit=100`),
    events: (issueId: number) =>
        getJson<EventDetail[]>(`/api/${projectId}/events?issueId=${issueId}&limit=20`),
    trace: (traceId: string) => getJson<TraceGraph>(`/api/${projectId}/traces/${traceId}`),
}
