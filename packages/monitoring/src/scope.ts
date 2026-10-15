/**
 * 会话作用域：随「这一个标签页」走的那些状态。
 *
 * 与 `state.ts` 的分工按「谁的寿命更长」切：
 * - `state.ts` 管**装配配置**（app / version / env / 采样率 / 开关 / 发送器），一次装配定下、
 *   整个应用生命周期不变
 * - 这里管**会话作用域**（设备画像、session_id、当前用户、当前路由、面包屑），随用户操作在变，
 *   而且**跨 createMonitor 保留**——重装监控不该把「出错前的现场」一起扔掉
 *
 * 两处**算一次就缓存**，理由都是信封每条事件都要组一次：
 * - 设备画像：`deviceInfo()` 要读 `navigator` + `screen`，边组边算等于每条事件多两次全局读
 * - `session_id`：要读 `sessionStorage`，同理
 *
 * 缓存的失效边界：这两样在一次页面生命周期内不会变（改窗口大小不改 `screen.width` 的含义，
 * 换用户不换标签页）。所以缓存没有失效逻辑，只在模块加载时懒算一次。
 */

import { type Breadcrumb, type DeviceInfo, deviceInfo, toRouteTemplate } from "./envelope"

/** 面包屑在内存里留多少条。几十条够还原「出错前那几十秒」（首批「现场」条），再多就是白花钱 */
const BREADCRUMB_LIMIT = 30

/** 一次页面生命周期内不变的画像。懒算 + 缓存，见文件头 */
export interface Profile {
    device: DeviceInfo
    sessionId: string
}

/** 传入门面：SSR / 单测里 import 本模块时不该碰到浏览器全局 */
function canUseDOM(): boolean {
    return typeof window !== "undefined" && typeof document !== "undefined"
}

/**
 * 设备画像：读一次就够了。
 *
 * 这里显式读全局而不是让调用方传参——`envelope.ts` 的 `deviceInfo` 是纯函数（好单测），
 * 「去哪儿读」这件事归本文件，两边职责不混。
 */
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
 * session_id：标签页首次加载时生成、存 `sessionStorage`——刷新不变，新标签页换新（契约第 1 条）。
 *
 * 用 `sessionStorage` 而不是 `localStorage`：一个标签页一个会话，跨标签页共享 id 会让
 * 「一个用户同时开三个页签」聚成一个人，错误率被算低三倍。
 *
 * 生成时机是首次读（懒生成）而不是模块加载时：SSR 侧也会加载这个模块，那时没有 sessionStorage。
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
        // 隐私模式 / 禁用 storage：退化成「本次加载一个 id」。仍可用，只是不跨刷新
        return `no-store-${Date.now().toString(36)}`
    }
}

let cachedProfile: Profile | undefined

/** 设备画像与 session_id。首次调用时算，之后命中缓存 */
export function profile(): Profile {
    cachedProfile ??= computeProfile()
    return cachedProfile
}

/** 当前路由**模板**（信封里 route / PV 都用它）。初值取当前地址，SSR 下降级成 "/" */
let route: string = typeof location === "undefined" ? "/" : toRouteTemplate(location.pathname)

/** 已登录用户 id。未登录是 `undefined`——它只会以「不带这个键」的形式进信封 */
let userId: string | undefined

/** 最近面包屑，环形保留 */
let breadcrumbs: Breadcrumb[] = []

/** 上一条路由事件的时刻，用来算停留时长 */
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

/** 记一条面包屑。随错误一起上报，是「有报错但复现不了」时的主要线索 */
export function addBreadcrumb(category: Breadcrumb["category"], message: string): void {
    // 只留短描述，不留输入内容（契约第 5 条隐私边界）
    breadcrumbs.push({ ts: Date.now(), category, message: message.slice(0, 200) })
    if (breadcrumbs.length > BREADCRUMB_LIMIT) breadcrumbs.shift()
}

/** 面包屑的**副本**。给出去的是快照，调用方改不动里面的数组 */
export function breadcrumbSnapshot(): Breadcrumb[] {
    return [...breadcrumbs]
}

/**
 * 装配时复位可变作用域。**故意不清面包屑**：配置常常在路由之前调，丢了等于把
 * 「出错前现场」扔掉——那正是装配重来时最不该丢的东西。
 */
export function resetScope(): void {
    route = typeof location === "undefined" ? "/" : toRouteTemplate(location.pathname)
    userId = undefined
    lastRouteAt = Date.now()
}
