import { useSyncExternalStore } from "react"

import { AuthApi } from "@shop/api/sdk"

import type { TokenStore } from "./sdk-client"

/**
 * 应用无关的登录态套件：access token 内存存储 + 启动静默刷新 + 设备 ID + 登录态订阅。
 *
 * 三个 app（web/seller/admin）共用同一份实现，差异只在装配参数：
 * - refresh：各自的刷新端点（C 端 authApi.refresh({deviceId})，admin adminApi.refresh(deviceId)）
 * - deviceKey：localStorage 键隔离多端会话
 *
 * 设备 ID 语义：web 与 seller 共享同一 refresh cookie（同浏览器不同 origin，localStorage 各一份），
 * 交替提交的两个 deviceId 由后端裁决——refresh token 首次登记的设备为准，轮换时不随提交值迁移
 * （见 RefreshTokenStore.rotate），吊销粒度是浏览器。前端照常上报即可，isCurrent 标记在非登录端可能不中。
 *
 * 路由守卫（requireAuth/requireGuest）与登录 UI（Dialog/跳页）是应用关注点，留在各 app。
 */

/** 登录态三态：unknown 启动未裁决 / authed 已登录 / guest 未登录 */
export type AuthStatus = "unknown" | "authed" | "guest"

export interface AuthKitOptions {
    /**
     * 静默刷新：bootstrapAuth 用它换新 access token。
     * 引用后置变量安全（调用发生在模块初始化完成后），如 () => authApi.refresh({ deviceId })。
     */
    refresh: (deviceId: string) => Promise<{ accessToken: string }>
    /** 设备 ID 的 localStorage 键（默认 "shop_device_id"；admin 用独立键隔离） */
    deviceKey?: string
}

export interface AuthKit {
    /** access token 只存内存；写入即裁决为 authed，清除即 guest */
    tokenStore: TokenStore
    /** 登录态只读访问 */
    authState: {
        getStatus: () => AuthStatus
    }
    /**
     * 启动时静默刷新：refresh cookie 有效则换新 access token，否则按未登录处理。
     * 去重为单例 Promise，可在多处安全 await（root 挂载、路由守卫、登录页）；已 authed 直接返回，
     * 而登出/被吊销清态会作废这份缓存 —— 下一次 await 重新裁决，不必整页重载才能再登录。
     */
    bootstrapAuth: () => Promise<void>
    /** 持久化设备 ID（localStorage，首次生成 UUID），用于多端会话管理 */
    getDeviceId: () => string
    /** 当前登录用户信息 hooks 的开关：authed 才发请求 */
    useAuthStatus: () => AuthStatus
    useIsLoggedIn: () => boolean
}

/** 标准买家/卖家端装配：生成 SDK 失败时抛给 createAuthKit，由它统一裁决为 guest。 */
export function createSdkAuthKit(): AuthKit {
    return createAuthKit({
        refresh: async (deviceId) => {
            const result = await AuthApi.refresh({ body: { deviceId } })
            if (!result.accessToken) throw new Error("refresh 失败")
            return { accessToken: result.accessToken }
        },
    })
}

export function createAuthKit(options: AuthKitOptions): AuthKit {
    const DEVICE_KEY = options.deviceKey ?? "shop_device_id"

    // 启动时一律 unknown，待 bootstrap 用 refresh cookie 换新 access token 后裁决
    // oxlint-disable-next-line no-null -- TokenStore.get 接口契约返回 string | null，内部变量与接口对齐
    let accessToken: string | null = null
    let status: AuthStatus = "unknown"
    let bootstrapPromise: Promise<void> | undefined
    let cachedDeviceId: string | undefined

    const listeners = new Set<() => void>()

    const emit = () => listeners.forEach((l) => l())

    const subscribe = (listener: () => void) => {
        listeners.add(listener)
        return () => {
            listeners.delete(listener)
        }
    }

    const authState = {
        getStatus: () => status,
    }

    const tokenStore: TokenStore = {
        get: () => accessToken,
        set: (token: string) => {
            accessToken = token
            status = "authed"
            emit()
        },
        clear: () => toGuest(true),
    }

    /**
     * 落为未登录。`invalidateBootstrap` 决定要不要作废静默刷新缓存：
     * 外部清态（登出、401/410 裁决）要作废 —— 否则缓存里那次「guest」会永远生效，
     * 刷新 cookie 明明有效（同一浏览器重新登录、或 access token 被单独吊销）也进不去，
     * 用户只能整页重载；而 bootstrapAuth 自己裁决出的 guest 不作废 —— 未登录时每次受保护
     * 导航都重打一次刷新接口，白白多一个请求。
     */
    function toGuest(invalidateBootstrap: boolean): void {
        // oxlint-disable-next-line no-null -- TokenStore.get 接口契约返回 string | null
        accessToken = null
        status = "guest"
        if (invalidateBootstrap) bootstrapPromise = undefined
        emit()
    }

    function bootstrapAuth(): Promise<void> {
        // 已登录不再刷新：登录成功后守卫每次都重打刷新接口，等于把 refresh 变成常态请求
        if (status === "authed") return Promise.resolve()
        bootstrapPromise ??= bootstrap()
        return bootstrapPromise
    }

    async function bootstrap(): Promise<void> {
        try {
            const result = await options.refresh(getDeviceId())
            tokenStore.set(result.accessToken)
        } catch {
            toGuest(false)
        }
    }

    function getDeviceId(): string {
        if (cachedDeviceId) return cachedDeviceId
        const stored = localStorage.getItem(DEVICE_KEY)
        if (stored) {
            cachedDeviceId = stored
            return stored
        }
        const id = crypto.randomUUID()
        localStorage.setItem(DEVICE_KEY, id)
        cachedDeviceId = id
        return id
    }

    function useAuthStatus(): AuthStatus {
        return useSyncExternalStore(subscribe, authState.getStatus, () => "unknown")
    }

    function useIsLoggedIn(): boolean {
        return useAuthStatus() === "authed"
    }

    return { tokenStore, authState, bootstrapAuth, getDeviceId, useAuthStatus, useIsLoggedIn }
}
