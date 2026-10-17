// 会话作用域：随「这一个标签页」走的可变状态（设备画像/session_id/用户/路由/面包屑）。与 state.ts 按寿命切分——那边管一次装配定下的配置，这边随操作在变且跨 createMonitor 保留。设备画像与 session_id 一次页面生命周期内不变，懒算+缓存无失效逻辑。

import { type Breadcrumb, type DeviceInfo, deviceInfo, toRouteTemplate } from "./envelope"

/** 几十条够还原「出错前那几十秒」，再多白花钱 */
const BREADCRUMB_LIMIT = 30

/** 一次页面生命周期内不变的画像，懒算+缓存 */
export interface Profile {
    device: DeviceInfo
    sessionId: string
}

/** 传入门面：SSR/单测 import 本模块时不该碰到浏览器全局 */
function canUseDOM(): boolean {
    return typeof window !== "undefined" && typeof document !== "undefined"
}

/** deviceInfo 是纯函数，「去哪儿读全局」归本文件 */
function computeProfile(): Profile {
    if (!canUseDOM())
        return {
            device: deviceInfo({ userAgent: "ssr", maxTouchPoints: 0 }, 0, 0),
            sessionId: "ssr",
        }
    return {
        device: deviceInfo(navigator, screen.width, screen.height),
        sessionId: currentSessionId(),
    }
}

/**
 * 标签页首次加载生成、存 sessionStorage——刷新不变、新标签页换新（契约第 1 条）。不用 localStorage：跨标签页共享 id 会把多开页签聚成一人、错误率被算低。
 */
function currentSessionId(): string {
    try {
        const key = "shop_monitoring_session"
        const existing = sessionStorage.getItem(key)
        if (existing) return existing
        const id = crypto.randomUUID()
        sessionStorage.setItem(key, id)
        return id
    } catch {
        // 隐私模式/禁用 storage：退化成「本次加载一个 id」，仍可用只是不跨刷新
        return `no-store-${Date.now().toString(36)}`
    }
}

let cachedProfile: Profile | undefined

export function profile(): Profile {
    cachedProfile ??= computeProfile()
    return cachedProfile
}

/** 路由模板（信封 route / PV 都用它）。SSR 下降级成 "/" */
let route: string = typeof location === "undefined" ? "/" : toRouteTemplate(location.pathname)

/** 未登录 undefined——只会以「不带这个键」的形式进信封 */
let userId: string | undefined

let breadcrumbs: Breadcrumb[] = []

let lastRouteAt = Date.now()

export function getRoute(): string {
    return route
}

export function setRoute(next: string): void {
    route = next
}

export function getUserId(): string | undefined {
    return userId
}

export function setUserId(next: string | undefined): void {
    userId = next
}

export function lastRouteMoment(): number {
    return lastRouteAt
}

export function markRouteMoment(at: number): void {
    lastRouteAt = at
}

/** 随错误一起上报，是「有报错但复现不了」时的主要线索 */
export function addBreadcrumb(category: Breadcrumb["category"], message: string): void {
    // 只留短描述、不留输入内容（契约第 5 条隐私边界）
    breadcrumbs.push({ ts: Date.now(), category, message: message.slice(0, 200) })
    if (breadcrumbs.length > BREADCRUMB_LIMIT) breadcrumbs.shift()
}

/** 给出的是快照，调用方改不动里面的数组 */
export function breadcrumbSnapshot(): Breadcrumb[] {
    return [...breadcrumbs]
}

/** 故意不清面包屑：配置常在路由前调，丢了即扔掉「出错前现场」 */
export function resetScope(): void {
    route = typeof location === "undefined" ? "/" : toRouteTemplate(location.pathname)
    userId = undefined
    lastRouteAt = Date.now()
}
