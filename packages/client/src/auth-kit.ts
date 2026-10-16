import { useSyncExternalStore } from "react"

import { AuthApi } from "@shop/api/sdk"

import type { TokenStore } from "./sdk-client"

/**
 * 三 app（web/seller/admin）共用实现，差异只在装配参数：refresh（各自刷新端点）、deviceKey（localStorage 键隔离多端会话）。
 * 设备 ID 语义：web 与 seller 共享同一 refresh cookie（不同 origin 各存一份 localStorage），交替提交的 deviceId 由后端裁决——
 * 以 refresh token 首次登记的设备为准，轮换不随提交值迁移（见 RefreshTokenStore.rotate），吊销粒度是浏览器；isCurrent 在非登录端可能不中。
 * 路由守卫（requireAuth/requireGuest）与登录 UI 是应用关注点，留在各 app。
 */

/** 登录态三态：unknown 启动未裁决 / authed 已登录 / guest 未登录 */
export type AuthStatus = "unknown" | "authed" | "guest"

export interface AuthKitOptions {
    /**
     * 静默刷新：bootstrapAuth 用它换新 access token。引用后置变量安全（调用在模块初始化完成后），如 () => authApi.refresh({ deviceId })。
     */
    refresh: (deviceId: string) => Promise<{ accessToken: string }>
    /** 设备 ID 的 localStorage 键（默认 "shop_device_id"；admin 用独立键隔离） */
    deviceKey?: string
}

export interface AuthKit {
    /** access token 只存内存；写入即裁决为 authed，清除即 guest */
    tokenStore: TokenStore
    authState: {
        getStatus: () => AuthStatus
    }
    /**
     * 启动时静默刷新：cookie 有效换新 access token，否则按未登录。去重为单例 Promise，多处 await 只发一次（root 挂载、路由守卫、登录页）；
     * 已 authed 直接返回；登出/被吊销清态会作废缓存，下次 await 重新裁决（不必整页重载再登录）。
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
     * 落为未登录。`invalidateBootstrap` 决定是否作废静默刷新缓存：外部清态（登出、401/410 裁决）要作废——
     * 否则那次「guest」缓存永远生效，cookie 明明有效也进不去；而 bootstrapAuth 自己裁决的 guest 不作废——未登录时每次受保护导航会重打刷新，白多请求。
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
