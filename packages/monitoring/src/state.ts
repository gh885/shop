/**
 * 监控的运行期状态与上报出口（frontend-monitoring.md 契约第 3 条）。
 *
 * 业务代码只调 `captureError` / `track`（从 `index.ts` re-export），不直接依赖任何
 * 第三方 SDK；换监控后端时改动收在这一个文件加一层转发。所以三端 router 的
 * `defaultOnCatch`、契约漂移的 `console.error` 锚点、i18n 缺 key 上报、曝光/点击上报，
 * 全部改走这里。
 *
 * 发送端与接收端均已接通，默认启用；`enabled: false` 可临时关闭上报。
 *
 * 上报什么、不采什么的边界见契约第 5 条：不采输入框内容 / 密码 / token，URL 的 query
 * 与 hash 不采（可能带 token 或个人信息），手机号只以 `maskPhone` 形态出现（GEN-51）。
 *
 * 为什么单例留在这个文件、不跟着装配走：`captureError` / `track` / `setMonitoringUser`
 * 要被 `packages/i18n`、`packages/client`、`packages/app-kit` **先于且独立于**任何
 * `createMonitor` 调用使用。所以状态是模块级的、装配只是往里灌配置（`applyOptions`）。
 *
 * 本文件**不 import 任何插件**，插件也不 import 本文件——它们只从 `monitor.ts` 拿到
 * `MonitorContext`。于是「插件 → 出口 → 插件」这种环在结构上不可能出现
 * （`import/no-cycle` 保持干净），这也是它从 `core.ts` 改名成 `state.ts` 的原因：
 * 它现在只管状态，不管装配。
 */

import {
    type AppName,
    type Breadcrumb,
    type Envelope,
    type MonitorErrorEvent,
    type MonitoringEvent,
    deviceInfo,
    fingerprint,
    toRouteTemplate,
} from "./envelope"
import { Transport } from "./transport"
import type { ErrorName, MonitoringOptions, TrackEvent } from "./types"

/** 面包屑在内存里留多少条。几十条够还原「出错前那几十秒」（首批「现场」条），再多就是白花钱 */
const BREADCRUMB_LIMIT = 30

/** 运行期状态：装配一次，之后只读 */
interface State {
    app: AppName
    version: string
    env: string
    sampleRate: number
    enabled: boolean
    debug: boolean
    transport: Transport
    /** 当前路由模板，随路由切换更新（信封里 route / PV 都用它） */
    route: string
    /** 已登录用户 id。有值才进信封 */
    userId: string | undefined
    /** 最近面包屑，环形保留 */
    breadcrumbs: Breadcrumb[]
    /** 「同一会话同一错误限次」的计数键 */
    seenErrors: Map<string, number>
    /** 上一条路由事件，用来算停留时长 */
    lastRouteAt: number
}

function initialState(options: MonitoringOptions): State {
    return {
        app: options.app,
        version: options.version ?? "dev",
        env: options.env ?? "dev",
        sampleRate: clampRate(options.sampleRate ?? 1),
        // 总开关默认开（接收端已上线，见 MonitoringOptions.enabled 的注释）。
        // 此前这里恒为 false，而三端的注释都写着「接收端上线时注入 endpoint 即可」——
        // 那句话是假的：光配 endpoint 一个字都不会发出去，接收端上线当天必然踩空
        enabled: options.enabled ?? true,
        debug: options.debug ?? false,
        transport:
            options.transport ??
            new Transport({ endpoint: options.endpoint, debug: options.debug }),
        route: typeof location !== "undefined" ? toRouteTemplate(location.pathname) : "/",
        userId: undefined,
        breadcrumbs: [],
        seenErrors: new Map(),
        lastRouteAt: Date.now(),
    }
}

function clampRate(rate: number): number {
    if (!Number.isFinite(rate)) return 1
    return Math.min(1, Math.max(0, rate))
}

/**
 * 装配前的默认状态：**不发**。
 *
 * <p>这不是「默认关」——三端在 `main.tsx` / 根路由里显式 `createMonitor` 之后就是开的
 * （`enabled` 缺省 true）。这一句只管「装配之前」那一小段：那时还没有 `app` / `version` / `env`，
 * 报出去的信封是错的，而带错信封的历史日志事后改不回来（observability.md 契约第 2 条）。
 */
let state: State = initialState({ app: "web", enabled: false })

/**
 * 灌入一份新配置，并把新的 `Transport` 还回去。**只做这个**——挂监听、起心跳是宿主
 * （`monitor.ts`）的事，因为那些东西要能被 `createMonitor` 卸载掉，而状态不需要。
 *
 * 不重置已积累的面包屑：配置常在路由之前调，丢了等于把「出错前现场」扔了。
 */
export function applyOptions(options: MonitoringOptions): Transport {
    const previous = state
    state = initialState(options)
    state.breadcrumbs = previous.breadcrumbs
    return state.transport
}

/**
 * 当前是否上报。装配宿主（`monitor.ts`）用它决定要不要起 transport 的生命周期与心跳——
 * 这个判断不能在那里重写一遍 `options.enabled ?? true`，否则默认值就有了第二个真相源。
 */
export function monitoringEnabled(): boolean {
    return state.enabled
}

/** 传入门面：SSR / 单测里 import 本模块时不该碰到浏览器全局 */
const canUseDOM = (): boolean => typeof window !== "undefined" && typeof document !== "undefined"

/**
 * session_id：标签页首次加载时生成、存 `sessionStorage`——刷新不变，新标签页换新（契约第 1 条）。
 *
 * 用 `sessionStorage` 而不是 `localStorage`：一个标签页一个会话，跨标签页共享 id 会让
 * 「一个用户同时开三个页签」聚成一个人，错误率被算低三倍。
 *
 * 生成时机是首次读（懒生成）而不是模块加载时：SSR 侧也会加载这个模块，那时没有 sessionStorage。
 */
function sessionId(): string {
    if (!canUseDOM()) return "ssr"
    try {
        const key = "shop_monitoring_session"
        const existing = sessionStorage.getItem(key)
        if (existing) return existing
        const id = crypto.randomUUID()
        sessionStorage.setItem(key, id)
        return id
    } catch {
        // 隐私模式 / 禁用 storage：退化成「本次加载一个 id」。仍可用，只是不跨刷新
        return `no-store-${Date.now().toString(36)}`
    }
}

/** 组信封。信封缺字段比多字段更难查——漏的那格在接收端看起来像「这个维度没采」，排查会走岔路 */
function envelope(): Envelope {
    const nav = canUseDOM() ? navigator : { userAgent: "ssr", maxTouchPoints: 0 }
    const size = canUseDOM() ? { w: screen.width, h: screen.height } : { w: 0, h: 0 }
    const base: Envelope = {
        schema: "shop.fe.v1",
        app: state.app,
        version: state.version,
        env: state.env,
        sessionId: sessionId(),
        route: state.route,
        ts: Date.now(),
        device: deviceInfo(nav, size.w, size.h),
        sampleRate: state.sampleRate,
    }
    // userId 可选：有值才带（键值为 undefined 时 JSON.stringify 会自动省略，不用手动 delete）
    return state.userId ? { ...base, userId: state.userId } : base
}

/** 记一条面包屑。随错误一起上报，是「有报错但复现不了」时的主要线索 */
export function addBreadcrumb(category: Breadcrumb["category"], message: string): void {
    // 只留短描述，不留输入内容（契约第 5 条隐私边界）
    state.breadcrumbs.push({ ts: Date.now(), category, message: message.slice(0, 200) })
    if (state.breadcrumbs.length > BREADCRUMB_LIMIT) state.breadcrumbs.shift()
}

/**
 * 上报的出口。全程 try/catch：监控抛出的异常会连带弄坏业务页（文件头已述）。
 */
function emit(event: MonitoringEvent): void {
    try {
        if (state.debug) {
            console.debug("[monitoring]", event)
            return
        }
        if (!state.enabled) return
        state.transport.enqueue(event)
        // 攒到一批或页面转后台才发（flush 的口径见 transport.ts）
        if (state.transport.pending >= 20) state.transport.flush()
    } catch {
        // 真的失败了也不向外抛：让监控的失败变成业务页的失败是最坏的结果
    }
}

/**
 * 采样：按 `sessionId` 的 hash 决定这个会话是否上报性能事件。
 *
 * 按会话而非按事件采样：同一会话内要么全报要么全不报，性能指标的分布才有意义
 * （按事件随机抽会得到「一个会话贡献了半条曲线」的扭曲分布）。
 */
function sampledSession(): boolean {
    if (state.sampleRate >= 1) return true
    if (state.sampleRate <= 0) return false
    // FNV-1a：分布够用且实现只有几行，比 crypto 便宜（每次性能事件都要算）
    let hash = 0x811c9dc5
    for (const char of sessionId()) {
        hash ^= char.charCodeAt(0)
        hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash / 0xffffffff < state.sampleRate
}

/**
 * 统一错误上报。三端所有错误路径的唯一出口。
 *
 * 「统一」体现在两处消重，都是为了不把同一个问题报成几百条：
 * - router 的 `defaultOnCatch` 与全局 `error` 监听会同时命中同一个渲染错误，各报一次会翻倍
 * - 循环依赖的组件会反复抛同一个错
 * 做法是按指纹限次：同一会话同一错误最多报 N 次（首次 + 后续少量，用来发现它还在持续）。
 */
export function captureError(
    name: ErrorName,
    error: unknown,
    extra: { requestId?: string; message?: string } = {},
): void {
    try {
        const message = extra.message ?? errorMessage(error)
        const stack = errorStack(error)
        const fingerprintKey = fingerprint(message, stack)
        // 同一会话同一错误报 3 次：首次必报，之后 2 次用来发现「它还在持续」，再多只是刷屏
        const seen = (state.seenErrors.get(fingerprintKey) ?? 0) + 1
        // 限次表不能无界：一次会话里几百个不同错误（轮询接口持续失败）会把 Map 撑到几 MB，
        // 而它是纯内存常驻。超量时清空——清空后最坏后果只是重复上报几条，不是丢数据
        if (state.seenErrors.size > 200) state.seenErrors.clear()
        state.seenErrors.set(fingerprintKey, seen)
        if (seen > 3) return

        const event: MonitorErrorEvent = {
            ...envelope(),
            kind: "error",
            name,
            message,
            stack,
            requestId: extra.requestId,
            fingerprint: fingerprintKey,
            breadcrumbs: [...state.breadcrumbs],
        }
        emit(event)
    } catch {
        // 同 emit：监控的失败不外抛
    }
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message || error.name
    if (typeof error === "string") return error
    try {
        // JSON.stringify 可能对 undefined / 函数 / 符号返回 undefined（非字符串），
        // 所以不能直接返回它的结果
        const json = JSON.stringify(error)
        if (typeof json === "string") return json
        return "[non-serializable error]"
    } catch {
        return "[unserializable error]"
    }
}

function errorStack(error: unknown): string | undefined {
    return error instanceof Error ? error.stack : undefined
}

export function track(event: TrackEvent): void {
    try {
        if (event.kind === "performance" && !sampledSession()) return
        // 补信封后才是完整事件；TS 不认交叉类型统一收窄，as 走的是「我们自己保证形状」这条路
        emit({ ...envelope(), ...event } as MonitoringEvent)
    } catch {
        // 同上：监控的失败不外抛
    }
}

/**
 * 路由切换时更新信封里的 route（模板化），并报一条 PV。
 *
 * `params` 传 router 的 params 对象本身（值→名），模板化靠它把 `abc123` 换成 `$orderId`。
 * 传**实际 pathname**（含参数值）而不是模板字符串：模板化是出口的职责，业务侧不该手拼
 * `$` 串——手拼就会在某条路由上漏传某个参数，那个页面的 PV 就带了真实 id 变成无界基数。
 */
export function trackRoute(to: string, params: Record<string, string | number> = {}): void {
    try {
        const now = Date.now()
        const previousDuration = now - state.lastRouteAt
        state.lastRouteAt = now
        // 顺序要紧：先更新 state.route 再组信封，否则这条 PV 带的还是上一页的 route
        state.route = toRouteTemplate(to, params)
        addBreadcrumb("route", to)
        if (state.enabled || state.debug) {
            // 不覆写 route：envelope() 里已经是模板化的 state.route（就是刚算的那个），
            // 这里再赋 to 会把真实路径写回去，模板化就白做了
            track({ kind: "route", to: state.route, duration: previousDuration })
        }
    } catch {
        // 同上
    }
}

/** 登录后设置 userId（登出清空）。有值才进信封——它是明细字段，不是指标标签 */
export function setMonitoringUser(userId: string | undefined): void {
    state.userId = userId
}

/** 供终值回调使用：hidden 生命周期监听可能已经先执行过。 */
export function flushMonitoring(): void {
    try {
        if (state.enabled) state.transport.flush()
    } catch {
        // 遥测发送失败不影响页面生命周期。
    }
}
