// 全局错误采集：未捕获 JS 异常、Promise 拒绝、资源加载失败。跨域脚本要加 `<script crossorigin>` 且 CDN 回 ACAO，否则这里只拿到 `Script error.`（无栈无 message，等于没报）——见契约「JS 异常」条。不设模块级「只绑一次」闩（那会让卸载后重装永远挂不上）。

import type { Integration } from "../types"

export const globalErrorsIntegration: Integration = {
    name: "global-errors",
    setup({ captureError }) {
        if (typeof window === "undefined" || typeof document === "undefined") return

        // 这里的 ErrorEvent 是 DOM 全局（非 envelope 的 MonitorErrorEvent）：window error 事件对象就是它，只带 message/stack 形态
        const onError = (event: ErrorEvent | Event) => {
            // 资源加载失败也走 window error：target 是元素（img/script/link）；window 不是
            // Element，instanceof 已经把 window 自己排除，不再单独比对
            const target = event.target
            if (target instanceof Element) {
                captureError("resource_load_error", null, {
                    message: `资源加载失败: ${target.tagName.toLowerCase()}`,
                })
                return
            }
            if (event instanceof ErrorEvent) {
                captureError("js_error", event.error ?? event.message, {
                    message: event.message,
                })
            }
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
