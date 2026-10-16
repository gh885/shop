import { captureError } from "@shop/monitoring"

/**
 * 判据是错误消息特征，而不是 React 的 `onRecoverableError` 回调：后者只在 `hydrateRoot`
 * 的 options 上，而 hydrateRoot 由 TanStack Start 的 `<Scripts>` 内部持有，本仓拿不到那个调用点。
 */
const HYDRATION_ERROR = "hydration_error"

/** 放宽到多个关键词，因为 React/框架各版本文案不一，写死一个必然漏 */
function isHydrationError(error: unknown): boolean {
    // 不直接 String(error)：对象会变成 "[object Object]"，永远不匹配
    let message = ""
    if (error instanceof Error) {
        message = error.message
    } else if (error !== undefined) {
        try {
            message = JSON.stringify(error) || ""
        } catch {
            message = ""
        }
    }
    return /hydrat|did not match|server (html|text)|text content does not match/i.test(message)
}

export function reportError(error: unknown, errorInfo?: unknown): void {
    if (import.meta.env.DEV) {
        console.error("[app-error]", error, errorInfo)
    }
    captureError(isHydrationError(error) ? HYDRATION_ERROR : "route_error", error)
}
