/**
 * web 的未捕获错误出口，喂给 router 的 `defaultOnCatch`。
 *
 * 这层薄壳存在的意义是**保持 router 配置处的可读性与单一出口的边界**：router 只认
 * `defaultOnCatch`，而实际的遥测逻辑（去重、限次、信封、现场）在 @shop/common 的
 * `captureError` 里。这里做的是 web 特有的那一点转换——把 TanStack Router 的
 * `(error, errorInfo)` 适配成监控出口的形状。
 *
 * 分工（别混）：UI 反馈由各路由的 errorComponent 负责（渲染友好错误页 + 重试），
 * 这里只管「让开发/监控看见」。两者是不同的问题——只做前者等于线上出错无人知晓，
 * 只做后者等于用户看到白屏。
 */
import { captureError } from "@shop/monitoring" /**
 * hydration 失败专用事件名。
 *
 * 为什么要单列而不是并进 route_error：hydration 失败**不产生 console.error**——页面看着正常、
 * 事件却不响应，用户视角是「点不动」。混进普通路由错误里它会被渲染错误的噪声淹没，
 * 而它是 SSR 这套架构下最常见也最难查的一类问题。
 *
 * 判据是错误消息特征，而不是 React 的 `onRecoverableError` 回调：后者只在 `hydrateRoot`
 * 的 options 上，而 hydrateRoot 由 TanStack Start 的 `<Scripts>` 内部持有，本仓拿不到那个
 * 调用点（硬接只能去劫持全局，那是比漏报更坏的做法）。
 */
const HYDRATION_ERROR = "hydration_error"

/** hydration 特征的关键词。放宽到多个，因为 React/框架各版本文案不一，写死一个必然漏 */
function isHydrationError(error: unknown): boolean {
    // 不直接 String(error)：对象会变成 "[object Object]"，永远不匹配。取 Error.message，
    // 非 Error 时 JSON 序列化（失败/无值就当作不匹配）
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

/** router 的 defaultOnCatch 签名：error + React 的 errorInfo（开发期带组件栈） */
export function reportError(error: unknown, errorInfo?: unknown): void {
    // 开发期连组件栈一起打——React 的 componentStack 是定位渲染期错误的主要线索。
    // 生产不取它：组件栈很长，上报它会让每条事件的 body 涨几 KB，而线上还原有 sourcemap 就够了
    if (import.meta.env.DEV) {
        console.error("[app-error]", error, errorInfo)
    }
    captureError(isHydrationError(error) ? HYDRATION_ERROR : "route_error", error)
}
