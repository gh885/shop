import { useEffect } from "react"
import { redirect, useNavigate } from "@tanstack/react-router"
import { useSyncExternalStore } from "react"

import { authState, bootstrapAuth } from "./client"

export type { AuthStatus } from "@shop/api"
// 共享登录态（实现在 @shop/api/auth-kit，装配见 ./client）；转发省得调用方跨文件取
export {
    tokenStore,
    getDeviceId,
    useAuthStatus,
    useIsLoggedIn,
    bootstrapAuth,
    authState,
} from "./client"

// ---------- 全局登录 Dialog 开关（web 特有：未登录拉起 Dialog 而非跳页） ----------

let loginDialogOpen = false

const dialogListeners = new Set<() => void>()

function emit() {
    dialogListeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
    dialogListeners.add(listener)
    return () => {
        dialogListeners.delete(listener)
    }
}

export function openLoginDialog() {
    loginDialogOpen = true
    emit()
}

export function closeLoginDialog() {
    loginDialogOpen = false
    emit()
}

export function useLoginDialogOpen(): [boolean, (open: boolean) => void] {
    const open = useSyncExternalStore(
        subscribe,
        () => loginDialogOpen,
        () => false,
    )
    const setOpen = (next: boolean) => (next ? openLoginDialog() : closeLoginDialog())
    return [open, setOpen]
}

// ---------- 路由守卫 ----------

/**
 * 受保护路由的 beforeLoad 守卫：确保登录态已裁决，未登录则拉起登录 Dialog 并跳回首页。
 *
 * SSR 首屏无法裁决登录态（refresh cookie 只在浏览器端刷新），直接放行，由页面的 useAuthGuard 兜底。
 *
 * 用法：createFileRoute('/x')({ beforeLoad: () => requireAuth(), ... })
 */
export async function requireAuth(): Promise<void> {
    if (import.meta.env.SSR) return
    await bootstrapAuth()
    if (authState.getStatus() !== "authed") {
        openLoginDialog()
        throw redirect({ to: "/" })
    }
}

/**
 * SSR 直访受保护页的客户端兜底守卫：挂载后裁决登录态，未登录拉起登录 Dialog 并跳回首页。
 * 与 beforeLoad 的 requireAuth 配合（客户端导航走 beforeLoad，SSR 直访走这里）。
 */
export function useAuthGuard(): void {
    const navigate = useNavigate()
    useEffect(() => {
        void (async () => {
            await bootstrapAuth()
            if (authState.getStatus() !== "authed") {
                openLoginDialog()
                await navigate({ to: "/" })
            }
        })()
    }, [navigate])
}
