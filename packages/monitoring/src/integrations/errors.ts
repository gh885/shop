/**
 * 全局错误采集插件：未捕获 JS 异常、Promise 拒绝、资源加载失败（首批「JS 异常」条）。
 *
 * 跨域脚本要额外加 `<script crossorigin>` 且 CDN 回 `Access-Control-Allow-Origin`，
 * 否则这里只能拿到 `Script error.`（没有栈、没有 message，等于没报）——见契约「JS 异常」条。
 *
 * 从重构前 `core.ts` 的 `bindGlobalListeners` 原样搬来，逻辑一字未改，只多了「返回卸载函数」。
 * 原来那个模块级 `listenersBound` 单向闩**去掉了**：宿主保证同一时刻只有一次装配，
 * 而闩本身会让「卸载后重装」永远挂不上（那正是这次重构要治的病之一）。
 */

import type { Integration } from "../types"

export const globalErrorsIntegration: Integration = {
    name: "global-errors",
    setup({ captureError }) {
        if (typeof window === "undefined" || typeof document === "undefined") return

        // 注意这里的 ErrorEvent 是 DOM 那个全局（不是 envelope 的 MonitorErrorEvent）：
        // window 的 error 事件对象就是它，只带 message 与 stack 形态，没有我们的信封
        const onError = (event: ErrorEvent | Event) => {
            // 资源加载失败也走 window error，但它没有 error 与 message（是 Event）
            const target = event.target
            if (target && target !== window && (target as Element).tagName) {
                const el = target as HTMLImageElement | HTMLScriptElement | HTMLLinkElement
                captureError("resource_load_error", null, {
                    message: `资源加载失败: ${el.tagName.toLowerCase()}`,
                })
                return
            }
            const err = event as globalThis.ErrorEvent
            captureError("js_error", err.error ?? err.message, { message: err.message })
        }

        const onRejection = (event: PromiseRejectionEvent) => {
            captureError("unhandled_rejection", event.reason)
        }

        addEventListener("error", onError)
        addEventListener("unhandledrejection", onRejection)
        return () => {
            removeEventListener("error", onError)
            removeEventListener("unhandledrejection", onRejection)
        }
    },
}
