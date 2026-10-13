import { useSyncExternalStore } from "react"

/**
 * 卖家端**会话种类**：登录的是店主（`owner`）还是店铺子账号（`subaccount`）。
 *
 * 两者是三套彼此隔离的认证主体：店主走买家手机号账号体系（`/auth/**`，刷新用
 * `auth/refresh`），子账号走自己的登录名 + 口令（`/auth/subaccount/**`，刷新用
 * `auth/subaccount/refresh`）。前端只有「当前是哪种」这一个开关，却决定三件事：
 *
 * - **静默刷新打哪个端点**（`createAuthKit` 的 refresh 与 SDK 的 `refreshPath`）；
 * - **要不要注入 `X-Shop-Id`**：子账号自带店铺，后端对「带别家店 X-Shop-Id」的请求直接 403；
 * - **`/shops/mine` 能不能打**：它只认买家令牌，子账号会话下必 401。
 *
 * 值是 `localStorage` 里的一格而不是 access token 的附带信息：刷新发生在**没有令牌**的时候
 * （启动 bootstrap、401 重试），那时只剩这一格能说明该拿哪张 refresh cookie 去换。
 * 默认 `owner`——这是「没有说过自己是子账号」的安全一侧（子账号伪造不了店主令牌，
 * 但反过来把店主当子账号就会拿错刷新端点而登不上去）。
 */
const STORAGE_KEY = "shop_seller_session_kind"

export type SessionKind = "owner" | "subaccount"

const listeners = new Set<() => void>()

function emit(): void {
    for (const listener of listeners) listener()
}

export function getSessionKind(): SessionKind {
    if (typeof localStorage === "undefined") return "owner"
    return localStorage.getItem(STORAGE_KEY) === "subaccount" ? "subaccount" : "owner"
}

export function setSessionKind(kind: SessionKind): void {
    try {
        localStorage.setItem(STORAGE_KEY, kind)
    } finally {
        emit()
    }
}

export function clearSessionKind(): void {
    try {
        localStorage.removeItem(STORAGE_KEY)
    } finally {
        emit()
    }
}

/** React 侧的订阅口：会话种类变化（登录 / 登出）要让守卫与账号区重新渲染 */
export function subscribeSessionKind(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function useSessionKind(): SessionKind {
    return useSyncExternalStore(subscribeSessionKind, getSessionKind, () => "owner")
}

/** 便捷判定：本端绝大多数分支只关心「是不是子账号」 */
export function isSubaccountSession(): boolean {
    return getSessionKind() === "subaccount"
}
