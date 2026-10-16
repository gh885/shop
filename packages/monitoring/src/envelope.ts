/** 事件信封：每条上报都要带的那几格，纯函数（不碰 window / sessionStorage / 网络）。逐字段语义与硬约束见 docs/conventions/frontend-monitoring.md（§契约）。 */

/** 信封版本，字符串联合（编译期挡拼错）；字段增删或语义变化即 +1 并与接收端协商，见 docs/conventions/frontend-monitoring.md。 */
export type EnvelopeSchema = "shop.fe.v1"

/** 三端标识：跟 apps/* 目录名一一对应。`app` 进了指标标签，所以只许这三个值，不许自由串 */
export type AppName = "web" | "seller" | "admin"

/** 设备维度：只取这几个粗粒度字段，够回答「是不是某个浏览器版本普遍坏」就够，不采 UA 原文 */
export interface DeviceInfo {
    /** 浏览器与版本（`navigator.userAgent` 解析出的大类，不带完整 UA 串） */
    browser: string
    /** 设备类型粗分：这三档足够区分「移动端问题」与「桌面端问题」 */
    deviceType: "mobile" | "tablet" | "desktop"
    /** 屏幕短边 CSS 像素：分档上报原始尺寸（指标标签基数可控，明细里查精确值） */
    screen: string
}

export interface Envelope {
    /** 信封版本。接收端按它选解析器——这是「以后加字段不破坏存量」的唯一办法 */
    schema: EnvelopeSchema
    app: AppName
    /** 构建标识，必须能定位到一次构建（后端信封同名，GEN-48） */
    version: string
    /** 真实环境。带错信封的历史日志事后改不回来，所以别用默认值糊 */
    env: string
    /** 会话：标签页首次加载时生成、存 sessionStorage——刷新不变，新标签页换新 */
    sessionId: string
    /** 已登录时的用户 id；未登录留空（它是标签，不能塞进指标标签，只能进明细字段） */
    userId?: string
    /** 路由**模板**（保留 `$id` 这类占位），不取实际 URL：实际 URL 带用户数据且基数无界 */
    route: string
    /** 事件时刻（epoch 毫秒）。接收端以此为准，不信任发送时刻（设备时钟可能不准） */
    ts: number
    device: DeviceInfo
    /** 上报当时的采样率：以后调了采样，历史数据仍能按比例还原成真实量 */
    sampleRate: number
}

/** 面包屑：随错误一起上报的最近现场。存内存，刷新即丢（不写 localStorage——那是持久化个人数据） */
export interface Breadcrumb {
    /** 什么时候发生的（epoch 毫秒） */
    ts: number
    /** 粗分类，聚合时按它归组 */
    category: "click" | "route" | "api" | "console" | "custom"
    /** 短描述。**不许放输入内容**：见契约第 5 条的隐私边界 */
    message: string
}

/** 错误事件：信封 + 错误形状 + 现场 */
export interface MonitorErrorEvent extends Envelope {
    kind: "error"
    /** 事件名（受控枚举，不要用动态串——它会变成指标标签） */
    name: string
    message: string
    /** 错误栈。生产环境能还原到源码靠 sourcemap（契约第 4 条），所以它必须带 */
    stack?: string
    /** 接口类事件带它，一跳到后端日志的 trace_id（契约第 2 条） */
    requestId?: string
    /** 归一化后的指纹：接收端按它聚合成「一个问题」（见 fingerprint） */
    fingerprint?: string
    breadcrumbs: Breadcrumb[]
}

export type WebVitalName = "LCP" | "INP" | "CLS"
export type ViewportSize = "small" | "large" | "unknown"

/** 导航级 Web Vitals 首次定稿样本；毫秒（LCP/INP）或无量纲（CLS）。 */
export interface MonitorPerformanceEvent extends Envelope {
    kind: "performance"
    name: WebVitalName
    metricId: string
    viewport: ViewportSize
    /** 指标值。毫秒或无量纲，取决于 name——由接收端那张表定义，不在这里猜 */
    value: number
    // 信封 route 仅作上下文，不用于 Web Vitals 分组：SPA 当前路由未必是导航起点。
}

/** 接口事件：失败全报，成功按采样报（首批功能「接口」条） */
export interface MonitorApiEvent extends Envelope {
    kind: "api"
    /** 路由模板，不是实际 URL（实际 URL 含用户数据） */
    endpoint: string
    method: string
    /** 真实状态码。网络层失败是 0——它与 4xx 不是一回事，接收端要分开看 */
    status: number
    /** 耗时（毫秒） */
    duration: number
    /** 失败时的错误摘要。契约第 5 条：不采请求体，只记形态 */
    message?: string
    /** 与后端日志对齐的 trace_id */
    requestId?: string
}

/** 路由事件：PV。它是错误率与白屏率的分母 */
export interface MonitorRouteEvent extends Envelope {
    kind: "route"
    /** 本次路由的模板 */
    to: string
    /** 停留时长（毫秒） */
    duration?: number
}

/** 文案兜底事件：一条用户可见错误没有可用 code 时由后端 detail 或按状态码通用句兜底。不采样、不限次（频次本身就是它的价值，故故意不走 captureError）。见 docs/conventions/frontend-monitoring.md（§契约 3、§首批功能）。 */
export interface MonitorFallbackEvent extends Envelope {
    kind: "fallback"
    /** 这句文案是从哪一支取到的：`detail` = 中文界面用后端那句；`status` = 按状态码的通用句 */
    source: "detail" | "status"
    /** 当时的 HTTP 状态码。0 表示网络层失败，与 4xx 不是一回事，接收端要分开看 */
    status: number
    /** 当时手上的 code，可选：status 支本就无码；detail 支「码登记了但 catalog 句子没填满」也是要收拢的信号 */
    code?: string
    /** 后端那句 detail（超长截断），唯一能指认「是哪句话」的字段；进日志字段不作指标标签 */
    detail?: string
}

/** 所有事件联合。传输层只认这个形状，接收端按 kind 分流 */
export type MonitoringEvent =
    | MonitorErrorEvent
    | MonitorPerformanceEvent
    | MonitorApiEvent
    | MonitorRouteEvent
    | MonitorFallbackEvent

/** 路由模板化：实际路径 → 带 `$param` 的模板（控指标基数）。params 传「值→参数名」映射按值反查、整段匹配；宁可不完美也不猜错，规则见 docs/conventions/frontend-monitoring.md。 */
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

/** 错误指纹（接收端聚合键）：归一化 message（抹数字/UUID）+ 栈顶几帧（不取全栈），见 docs/conventions/frontend-monitoring.md（§首批功能「聚合」）。 */
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
        ) // 去掉 (行:列) —— 行号每次构建都变
        .filter((frame) => frame.length > 0)
        .join("|")
    return `${normalized}::${topFrames}`
}

/** 浏览器大类模式表：只解析粗粒度三格，不发完整 UA（高基数），见 docs/conventions/frontend-monitoring.md。 */
const BROWSER_PATTERNS: readonly (readonly [string, RegExp])[] = [
    // 顺序即优先级：Edge 的 UA 里含 Chrome、Safari 的 UA 里含 Chrome，
    // 排在前面的先匹配上，Chrome 那个兜底分支就只会命中真的 Chrome
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
