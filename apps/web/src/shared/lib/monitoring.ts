/**
 * web（SSR）的监控启动。
 *
 * 与 seller/admin 的 `startSpaMonitoring` 分开写，原因是三处形态不同，不是风格偏好：
 * - **web 是 SSR**：这个 hook 只在客户端跑（服务端没有 PerformanceObserver / sendBeacon），
 *   所以它整体挂在 useEffect 里，SSR 一次都不执行——服务端渲染错误另有 `captureSsrError` 出口
 * - **web 不做白屏检测**：SSR 首屏有 HTML，要盯的是 hydration 失败（看着正常、点不动），
 *   而白屏那套 elementFromPoint 采样是给「壳 + JS 渲染」的 SPA 用的（首批功能条已写明这个分工）
 * - **web 有 Web Vitals**：买家端性能直接影响转化，LCP/CLS/INP 的 p75 从上线第一天攒；
 *   seller/admin 是内部工作台，量了也不看
 *
 * 装配点选在根路由 DocumentShell：它是三端共有的「app 装配」位置，且一定早于任何业务组件
 * 挂载（首屏任何一处抛错都要能被接住）。
 */
import { useEffect } from "react"

import { bindGlobalListeners, bindWebVitals, configureMonitoring } from "@shop/common"
import { trackRouteResolved } from "@shop/app-kit"
import { useRouter } from "@tanstack/react-router"

/** 版本/环境：与后端信封同名（GEN-48）。构建期注入，缺省 dev——别用空串糊，信封错事后改不回来 */
const VERSION = import.meta.env.VITE_APP_VERSION ?? "dev"
const ENV = import.meta.env.VITE_APP_ENV ?? "dev"

/** 接收端路径：接收端还没上线，所以留空即默认关（enabled 缺省 false）。上线时注入即可 */
const ENDPOINT = import.meta.env.VITE_RUM_ENDPOINT

/** 挂在根路由：启监听、量 Web Vitals、订阅路由变化报 PV */
export function useWebMonitoring(): void {
    const router = useRouter()
    useEffect(() => {
        configureMonitoring({ app: "web", version: VERSION, env: ENV, endpoint: ENDPOINT })
        bindGlobalListeners()
        bindWebVitals()

        // PV：每次路由解析成功一条（与 seller/admin 同一份接线，模板化口径三端一致）
        const unsubscribe = trackRouteResolved(router)
        return unsubscribe
    }, [router])
}
