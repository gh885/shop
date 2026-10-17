// 事件信封：每条上报都带的几格，纯函数（不碰 window/sessionStorage/网络）。逐字段语义与硬约束见 frontend-monitoring.md §契约。

/** 字段增删或语义变化即 +1 并与接收端协商 */
export type EnvelopeSchema = "shop.fe.v1"

/** app 进了指标标签，只许这三个值，不许自由串 */
export type AppName = "web" | "seller" | "admin"

/** 只取粗粒度三格，不采 UA 原文（高基数） */
export interface DeviceInfo {
    browser: string
    deviceType: "mobile" | "tablet" | "desktop"
    screen: string
}

export interface Envelope {
    schema: EnvelopeSchema
    app: AppName
    version: string
    env: string
    sessionId: string
    /** 它是标签，不能塞指标标签，只能进明细字段 */
    userId?: string
    /** 模板（保留 `$id`），不取实际 URL：实际 URL 带用户数据且基数无界 */
    route: string
    /** epoch 毫秒。接收端以此为准，不信任发送时刻（设备时钟可能不准） */
    ts: number
    device: DeviceInfo
    sampleRate: number
}

/** 存内存刷新即丢（不写 localStorage——那是持久化个人数据） */
export interface Breadcrumb {
    ts: number
    category: "click" | "route" | "api" | "console" | "custom"
    /** **不许放输入内容**：见契约第 5 条隐私边界 */
    message: string
}

export interface MonitorErrorEvent extends Envelope {
    kind: "error"
    /** 受控枚举，不要用动态串——它会变成指标标签 */
    name: string
    message: string
    stack?: string
    requestId?: string
    /** 归一化指纹：接收端按它聚合成「一个问题」（见 fingerprint） */
    fingerprint?: string
    breadcrumbs: Breadcrumb[]
}

export type WebVitalName = "LCP" | "INP" | "CLS"
export type ViewportSize = "small" | "large" | "unknown"

export interface MonitorPerformanceEvent extends Envelope {
    kind: "performance"
    name: WebVitalName
    metricId: string
    viewport: ViewportSize
    value: number
    // 信封 route 仅作上下文，不用于分组：SPA 当前路由未必是导航起点
}

/** 失败全报，成功按采样报 */
export interface MonitorApiEvent extends Envelope {
    kind: "api"
    /** 路由模板，不是实际 URL（含用户数据） */
    endpoint: string
    method: string
    /** 网络层失败是 0，与 4xx 不是一回事，接收端分开看 */
    status: number
    duration: number
    /** 契约第 5 条：不采请求体，只记形态 */
    message?: string
    requestId?: string
}

/** PV，是错误率与白屏率的分母 */
export interface MonitorRouteEvent extends Envelope {
    kind: "route"
    to: string
    duration?: number
}

/** 文案兜底：用户可见错误没有可用 code 时由后端 detail 或按状态码通用句兜底。不采样、不限次（频次本身就是它的价值，故不走 captureError）。见 frontend-monitoring.md §契约 3 */
export interface MonitorFallbackEvent extends Envelope {
    kind: "fallback"
    source: "detail" | "status"
    status: number
    code?: string
    /** 唯一能指认「是哪句话」的字段；进日志字段不作指标标签 */
    detail?: string
}

export type MonitoringEvent =
    | MonitorErrorEvent
    | MonitorPerformanceEvent
    | MonitorApiEvent
    | MonitorRouteEvent
    | MonitorFallbackEvent

/** 实际路径 → 带 `$param` 的模板（控指标基数）。规则见 frontend-monitoring.md */
export function toRouteTemplate(
    pathname: string,
    params: Record<string, string | number> = {},
): string {
    const named = new Map(
        Object.entries(params)
            .filter(([, value]) => String(value).length > 0)
            .map(([name, value]) => [String(value), name]),
    )
    const segments = pathname.split("/").filter((segment) => segment.length > 0)
    return (
        "/" +
        segments
            .map((segment) => {
                const name = named.get(segment)
                if (name) return `$${name}`
                if (/^\d+$/.test(segment)) return "$id"
                return segment
            })
            .join("/")
    )
}

/** 接收端聚合键：归一化 message（抹数字/UUID）+ 栈顶几帧。见 frontend-monitoring.md §聚合 */
export function fingerprint(message: string, stack: string | undefined): string {
    const normalized = message.replaceAll(/\d+|[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "#")
    const topFrames = (stack ?? "")
        .split("\n")
        .slice(1, 4) // 第 0 行是 "Error: message"，帧从第 1 行起
        .map((frame) =>
            frame
                .trim()
                .replace(/\(.*\)/, "")
                .trim(),
        ) // 去掉 (行:列)——行号每次构建都变
        .filter((frame) => frame.length > 0)
        .join("|")
    return `${normalized}::${topFrames}`
}

const BROWSER_PATTERNS: readonly (readonly [string, RegExp])[] = [
    // 顺序即优先级：Edge/Safari 的 UA 里都含 Chrome，排前的先匹配，Chrome 兜底分支只命中真 Chrome
    ["edge", /Edg\/(\d+)/],
    ["firefox", /Firefox\/(\d+)/],
    ["chrome", /Chrome\/(\d+)/],
    ["safari", /Safari\/(\d+)/],
]

export function deviceInfo(
    nav: { userAgent: string; maxTouchPoints: number },
    width: number,
    height: number,
): DeviceInfo {
    const ua = nav.userAgent
    let browser = "unknown"
    for (const [name, pattern] of BROWSER_PATTERNS) {
        const matched = pattern.exec(ua)
        if (matched) {
            browser = `${name} ${matched[1]}`
            break
        }
    }
    const minSide = Math.min(width, height)
    const deviceType =
        nav.maxTouchPoints > 0 && minSide < 768 ? "mobile" : minSide < 1024 ? "tablet" : "desktop"
    return { browser, deviceType, screen: `${width}x${height}` }
}
