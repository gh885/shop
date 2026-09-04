import { useSyncExternalStore } from "react"

import type { TokenStore } from "./sdk-client"

/**
 * 应用无关的登录态套件：access token 内存存储 + 启动静默刷新 + 设备 ID + 登录态订阅。
 *
 * 三个 app（web/seller/admin）共用同一份实现，差异只在装配参数：
 * - refresh：各自的刷新端点（C 端 authApi.refresh({deviceId})，admin adminApi.refresh(deviceId)）
 * - deviceKey：localStorage 键隔离多端会话
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
    tokenStore: TokenStore & { clear: () => void }
    /** 登录态只读访问 */
    authState: {
        getStatus: () => AuthStatus
    }
    /**
     * 启动时静默刷新：refresh cookie 有效则换新 access token，否则按未登录处理。
     * 去重为单例 Promise，可在多处安全 await（root 挂载、路由守卫、登录页）。
     */
    bootstrapAuth: () => Promise<void>
    /** 持久化设备 ID（localStorage，首次生成 UUID），用于多端会话管理 */
    getDeviceId: () => string
    /** 当前登录用户信息 hooks 的开关：authed 才发请求 */
    useAuthStatus: () => AuthStatus
    useIsLoggedIn: () => boolean
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

    const tokenStore: TokenStore & { clear: () => void } = {
        get: () => accessToken,
        set: (token: string) => {
            accessToken = token
            status = "authed"
            emit()
        },
        clear: () => {
            // oxlint-disable-next-line no-null -- TokenStore.get 接口契约返回 string | null
            accessToken = null
            status = "guest"
            emit()
        },
    }

    function bootstrapAuth(): Promise<void> {
        bootstrapPromise ??= bootstrap()
        return bootstrapPromise
    }

    async function bootstrap(): Promise<void> {
        try {
            const result = await options.refresh(getDeviceId())
            tokenStore.set(result.accessToken)
        } catch {
            tokenStore.clear()
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
