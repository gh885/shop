/**
 * 监控的运行期**配置**与上报出口（`frontend-monitoring.md` 契约第 3 条）。业务代码只调
 * `captureError`/`track`（从 `index.ts` re-export），不依赖任何第三方 SDK；换后端改这一个文件加一层转发。
 * 本文件只管**装配配置**（app/version/env/采样率/开关/发送器/加工链，一次装配定下不变）；会变的会话态在
 * `scope.ts`，「发不发」在 `processors.ts`。默认启用，`enabled: false` 可临时关闭；上报边界见契约第 5 条。
 *
 * 两处代码里看不出的设计：单例留本文件、不跟装配走，因为 i18n/client/app-kit 会**先于且独立于**任何
 * `createMonitor` 调 `captureError`/`track`，装配只是往模块级配置灌新值；本文件**不 import 任何插件**、
 * 插件也不 import 本文件（只从 `monitor.ts` 拿 `MonitorContext`），「插件→出口→插件」的环在结构上不可能。
 */

import {
    type AppName,
    type Envelope,
    type MonitorErrorEvent,
    type MonitoringEvent,
    fingerprint,
    toRouteTemplate,
} from "./envelope"
import { DEFAULT_PROCESSORS, applyProcessors } from "./processors"
import {
    addBreadcrumb,
    breadcrumbSnapshot,
    getRoute,
    getUserId,
    lastRouteMoment,
    markRouteMoment,
    profile,
    resetScope,
    setRoute,
    setUserId,
} from "./scope"
import { Transport } from "./transport"
import type { ErrorName, EventProcessor, MonitoringOptions, TrackEvent } from "./types"

export { addBreadcrumb } from "./scope"

/** 攒到多少条就提前发。攒批是为了省请求，但攒太久会让「偶发一条」等到心跳（30s）才走 */
const FLUSH_THRESHOLD = 20

/** 运行期配置：装配一次，之后只读 */
interface State {
    app: AppName
    version: string
    env: string
    sampleRate: number
    enabled: boolean
    debug: boolean
    transport: Transport
    /** 装配时就解析好的加工链（用户那个函数已经跑过），出口只管依次跑它 */
    processors: readonly EventProcessor[]
}

function initialState(options: MonitoringOptions): State {
    return {
        app: options.app,
        version: options.version ?? "dev",
        env: options.env ?? "dev",
        sampleRate: clampRate(options.sampleRate ?? 1),
        // 总开关默认开（接收端已上线，见 MonitoringOptions.enabled 的注释）
        enabled: options.enabled ?? true,
        debug: options.debug ?? false,
        // 队列、生命周期、账本都归 Transport 一家；注入方换掉的只是最后一跳（options.send）
        transport: new Transport({
            endpoint: options.endpoint,
            send: options.send,
            debug: options.debug,
        }),
        processors: options.processors
            ? options.processors(DEFAULT_PROCESSORS)
            : DEFAULT_PROCESSORS,
    }
}

function clampRate(rate: number): number {
    if (!Number.isFinite(rate)) return 1
    return Math.min(1, Math.max(0, rate))
}

/**
 * 装配前的默认配置：**不发**。
 *
 * 这不是「默认关」——三端在 `main.tsx` / 根路由里显式 `createMonitor` 之后就是开的
 * （`enabled` 缺省 true）。这一句只管「装配之前」那一小段：那时还没有 `app` / `version` / `env`，
 * 报出去的信封是错的，而带错信封的历史日志事后改不回来（observability.md 契约第 2 条）。
 */
let state: State = initialState({ app: "web", enabled: false })

/** 灌入一份新配置并把新发送器还回去。**只做这个**——挂监听、起心跳是宿主 `monitor.ts` 的事（那些要能被 `createMonitor` 卸载，配置不需要） */
export function applyOptions(options: MonitoringOptions): Transport {
    state = initialState(options)
    resetScope()
    return state.transport
}

/**
 * 当前是否上报。装配宿主（`monitor.ts`）用它决定要不要起 transport 的生命周期与心跳——
 * 这个判断不能在那里重写一遍 `options.enabled ?? true`，否则默认值就有了第二个真相源。
 */
export function monitoringEnabled(): boolean {
    return state.enabled
}

/**
 * 组信封（契约第 1 条）。设备画像与 session_id 从 `scope` 的缓存里取，不在这里重算——
 * 它们是每条事件都要用到的，边组边读 `navigator` / `sessionStorage` 是白扔掉的开销。
 *
 * 信封缺字段比多字段更难查——漏的那格在接收端看起来像「这个维度没采」，排查会走岔路。
 */
function envelope(): Envelope {
    const { device, sessionId } = profile()
    const base: Envelope = {
        schema: "shop.fe.v1",
        app: state.app,
        version: state.version,
        env: state.env,
        sessionId,
        route: getRoute(),
        ts: Date.now(),
        device,
        sampleRate: state.sampleRate,
    }
    const userId = getUserId()
    // userId 可选：有值才带（键值为 undefined 时 JSON.stringify 会自动省略，不用手动 delete）
    return userId ? { ...base, userId } : base
}

/**
 * 上报出口：**先过加工链，再判断发不发**，全程 try/catch（监控抛异常会连带弄坏业务页）。
 * 加工链跑在开关判断之前：关掉上报不该让「同一错误报了几次」的账变得不可信。
 */
function emit(event: MonitoringEvent): void {
    try {
        const processed = applyProcessors(state.processors, event)
        if (processed === undefined) return
        if (state.debug) {
            console.debug("[monitoring]", processed)
            return
        }
        if (!state.enabled) return
        state.transport.enqueue(processed)
        // 攒到一批或页面转后台才发（flush 的口径见 transport.ts）
        if (state.transport.pending >= FLUSH_THRESHOLD) state.transport.flush()
    } catch {
        // 真的失败了也不向外抛：让监控的失败变成业务页的失败是最坏的结果
    }
}

/** 统一错误上报（三端所有错误路径的唯一出口）。这里只把错误整理成一条事件并算好指纹放进事件；限几条由加工链的 `errorLimitProcessor` 决定（会用到这个指纹） */
export function captureError(
    name: ErrorName,
    error: unknown,
    extra: { requestId?: string; message?: string } = {},
): void {
    try {
        const message = extra.message ?? errorMessage(error)
        const stack = errorStack(error)
        const event: MonitorErrorEvent = {
            ...envelope(),
            kind: "error",
            name,
            message,
            stack,
            requestId: extra.requestId,
            fingerprint: fingerprint(message, stack),
            breadcrumbs: breadcrumbSnapshot(),
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
        // 接口事件顺手留一条面包屑：出错信封里就能看出「出错前调了哪些接口、什么状态码」。
        // 与 trackRoute 留 route 面包屑同一个位置、同一个理由——记在出口，不靠调用方记得。
        // 放在开关判断之前：与 trackRoute 一样，开关关着也照样留痕
        if (event.kind === "api")
            addBreadcrumb("api", `${event.method} ${event.endpoint} ${event.status}`)
        // 补信封后才是完整事件；TS 不认交叉类型统一收窄，as 走的是「我们自己保证形状」这条路
        emit({ ...envelope(), ...event })
    } catch {
        // 同上：监控的失败不外抛
    }
}

/**
 * 路由切换：更新信封里的 route（模板化）并报一条 PV。`params` 传 router 的 params 对象本身（值→名）。
 * 调用方传**实际 pathname**（含参数值）而非模板串——模板化是出口的职责；手拼 `$` 串会在某条路由漏传参数，
 * 那页 PV 就带了真实 id、变成无界基数。
 */
export function trackRoute(to: string, params: Record<string, string | number> = {}): void {
    try {
        const now = Date.now()
        const previousDuration = now - lastRouteMoment()
        markRouteMoment(now)
        // 顺序要紧：先更新 route 再组信封，否则这条 PV 带的还是上一页的 route
        setRoute(toRouteTemplate(to, params))
        addBreadcrumb("route", to)
        if (state.enabled || state.debug) {
            // 不覆写 route：envelope() 里已经是模板化的 route（就是刚算的那个），
            // 这里再赋 to 会把真实路径写回去，模板化就白做了
            track({ kind: "route", to: getRoute(), duration: previousDuration })
        }
    } catch {
        // 同上
    }
}

/** 登录后设置 userId（登出清空）。有值才进信封——它是明细字段，不是指标标签 */
export function setMonitoringUser(userId: string | undefined): void {
    setUserId(userId)
}

/** 供终值回调使用：hidden 生命周期监听可能已经先执行过。 */
export function flushMonitoring(): void {
    try {
        if (state.enabled) state.transport.flush()
    } catch {
        // 遥测发送失败不影响页面生命周期。
    }
}
