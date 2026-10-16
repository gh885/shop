/**
 * - **web 是 SSR**：这个 hook 只在客户端跑（服务端没有 PerformanceObserver / sendBeacon），
 *   所以它整体挂在 useEffect 里，SSR 一次都不执行
 *
 * 返回值里 `dispose()` 卸载本轮装上的监听与定时器——StrictMode 下 effect 会跑两遍，
 * 没有它就会留下两组 window 监听和一个孤儿心跳。
 */
import { useEffect } from "react"

import { trackRouteResolved } from "@shop/app-kit/shell"
import { blankScreenIntegration, createMonitor } from "@shop/monitoring"
import { useRouter } from "@tanstack/react-router"

const VERSION = import.meta.env.VITE_APP_VERSION ?? "dev"
const ENV = import.meta.env.VITE_APP_ENV ?? "dev"

const ENDPOINT = import.meta.env.VITE_RUM_ENDPOINT

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
        return () => {
            unsubscribe()
            monitor.dispose()
        }
    }, [router])
}
