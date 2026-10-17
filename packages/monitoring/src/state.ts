// 装配配置与上报出口（契约见 frontend-monitoring.md 第 3 条）。单例留本文件、不跟装配走：i18n/client/app-kit 先于 createMonitor 调 captureError/track。本文件不 import 任何插件，「插件→出口→插件」的环结构上不可能。

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

/** 攒够就提前发：攒批省请求，攒太久会让偶发一条等到心跳 */
const FLUSH_THRESHOLD = 20

interface State {
    app: AppName
    version: string
    env: string
    sampleRate: number
    enabled: boolean
    debug: boolean
    transport: Transport
    /** 装配时解析好的加工链，出口只管依次跑 */
    processors: readonly EventProcessor[]
}

function initialState(options: MonitoringOptions): State {
    return {
        app: options.app,
        version: options.version ?? "dev",
        env: options.env ?? "dev",
        sampleRate: clampRate(options.sampleRate ?? 1),
        enabled: options.enabled ?? true,
        debug: options.debug ?? false,
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

// 装配前默认不发：那时还没有 app/version/env，报出去的信封是错的且事后改不回（observability.md 第 2 条）。三端 main.tsx 显式 createMonitor 后即开。
let state: State = initialState({ app: "web", enabled: false })

/** 灌入新配置并把新发送器还回去。只做这个——挂监听/起心跳要能被 createMonitor 卸载，归宿主 monitor.ts */
export function applyOptions(options: MonitoringOptions): Transport {
    state = initialState(options)
    resetScope()
    return state.transport
}

/** 当前是否上报。宿主用它决定要不要起生命周期，不能在那重写 `?? true`（否则默认值有两个真相源） */
export function monitoringEnabled(): boolean {
    return state.enabled
}

/**
 * 组信封（契约第 1 条）。设备画像与 session_id 从 scope 缓存取，不在此重算（每条事件都用，边组边读 navigator/sessionStorage 是白扔开销）。信封缺字段比多字段难查——漏的那格在接收端像「没采」，排查走岔路。
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
    return userId ? { ...base, userId } : base
}

/**
 * 上报出口：先过加工链再判开关（关掉上报不该让「同一错误报了几次」的账变不可信），全程 try/catch（监控抛异常会弄坏业务页）。
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
        if (state.transport.pending >= FLUSH_THRESHOLD) state.transport.flush()
    } catch {
        // 监控失败不外抛
    }
}

/** 统一错误上报（三端错误路径唯一出口）。这里只整理成一条事件并算指纹，限几条由 errorLimitProcessor 决定 */
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
        // JSON.stringify 对 undefined/函数/符号返回 undefined（非字符串），不能直接返回其结果
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
        // 接口事件顺手留面包屑，记在出口不靠调用方记得；放开关判断前——开关关着也照样留痕
        if (event.kind === "api")
            addBreadcrumb("api", `${event.method} ${event.endpoint} ${event.status}`)
        emit({ ...envelope(), ...event })
    } catch {
        // 监控失败不外抛
    }
}

/**
 * 路由切换：报一条 PV。调用方传实际 pathname（含参数值）而非模板串——模板化是出口职责，手拼会在某条路由漏传参数、那页 PV 带上真实 id 变无界基数。
 */
export function trackRoute(to: string, params: Record<string, string | number> = {}): void {
    try {
        const now = Date.now()
        const previousDuration = now - lastRouteMoment()
        markRouteMoment(now)
        // 先更新 route 再组信封，否则这条 PV 带上一页的 route
        setRoute(toRouteTemplate(to, params))
        addBreadcrumb("route", to)
        if (state.enabled || state.debug) {
            track({ kind: "route", to: getRoute(), duration: previousDuration })
        }
    } catch {
        // 监控失败不外抛
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
