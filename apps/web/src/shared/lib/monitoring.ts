/**
 * - **web 是 SSR**：这个 hook 只在客户端跑（服务端没有 PerformanceObserver / sendBeacon），
 *   所以它整体挂在 useEffect 里，SSR 一次都不执行
 *
 * 返回值里 `dispose()` 卸载本轮装上的监听与定时器——StrictMode 下 effect 会跑两遍，
 * 没有它就会留下两组 window 监听和一个孤儿心跳。
 */
import { useEffect } from "react"

import { trackRouteResolved } from "@shop/app-kit/shell"
import { blankScreenIntegration, createMonitor, trackRoute } from "@shop/monitoring"
import { useRouter } from "@tanstack/react-router"

const VERSION = import.meta.env.VITE_APP_VERSION ?? "dev"
const ENV = import.meta.env.VITE_APP_ENV ?? "dev"

const ENDPOINT = import.meta.env.VITE_RUM_ENDPOINT

const INITIAL_PV_KEY = "shop.rum.initial-pv"

/**
 * 首屏 PV 只补报一次。
 *
 * 补报本身是必须的：SSR 下服务端已经把路由 resolve 完了，客户端水合后订阅 `onResolved` 只能收到之后的切换，
 * 首屏那一次永远丢。seller/admin 走 `mountSpa`、在 `render()` 之前订阅，所以它们不受影响。
 *
 * 要等一个宏任务再报：dev 的 StrictMode 是「装配 → 卸载 → 再装配」，同步补报会进第一轮的 transport
 * （那一轮随即被 dispose，排好的 idle flush 一起被取消，事件永远发不出去）。`setTimeout` 跑在所有 effect
 * 之后，那时队列已经挂在存活的那台上。去重用 sessionStorage：模块变量在 dev 下实测挡不住两轮。
 */
function claimInitialPv(path: string): boolean {
    try {
        if (sessionStorage.getItem(INITIAL_PV_KEY) === path) return false
        sessionStorage.setItem(INITIAL_PV_KEY, path)
        return true
    } catch {
        return true
    }
}

export function useWebMonitoring(): void {
    const router = useRouter()
    useEffect(() => {
        const monitor = createMonitor({
            app: "web",
            version: VERSION,
            env: ENV,
            endpoint: ENDPOINT,
            integrations: (defaults) =>
                defaults.filter((integration) => integration !== blankScreenIntegration),
        })

        const unsubscribe = trackRouteResolved(router)
        const path = router.state.location.pathname
        const params = router.state.matches.at(-1)?.params ?? {}
        const timer = setTimeout(() => {
            if (claimInitialPv(path)) trackRoute(path, params)
        }, 0)
        return () => {
            clearTimeout(timer)
            unsubscribe()
            monitor.dispose()
        }
    }, [router])
}
