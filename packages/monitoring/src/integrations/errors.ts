// 全局错误采集：未捕获 JS 异常、Promise 拒绝、资源加载失败。跨域脚本要加 `<script crossorigin>` 且 CDN 回 ACAO，否则这里只拿到 `Script error.`（无栈无 message，等于没报）——见契约「JS 异常」条。不设模块级「只绑一次」闩（那会让卸载后重装永远挂不上）。

import type { Integration } from "../types"

export const globalErrorsIntegration: Integration = {
    name: "global-errors",
    setup({ captureError }) {
        if (typeof window === "undefined" || typeof document === "undefined") return

        // 这里的 ErrorEvent 是 DOM 全局（非 envelope 的 MonitorErrorEvent）：window error 事件对象就是它，只带 message/stack 形态
        const onError = (event: ErrorEvent | Event) => {
            // 资源加载失败也走 window error，但它是 Event、没有 error 与 message
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
