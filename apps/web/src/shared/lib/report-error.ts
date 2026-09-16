/**
 * 未捕获错误的统一上报出口，喂给 router 的 `defaultOnCatch`。
 *
 * 分工（别混）：UI 反馈由各路由的 errorComponent 负责（渲染友好错误页 + 重试），
 * 这里只管「让开发/监控看见」。两者是不同的问题——只做前者等于线上出错无人知晓，
 * 只做后者等于用户看到白屏。
 *
 * 为什么要显式写：不配 defaultOnCatch 时框架的默认实现只 console.error，
 * 一旦要接 Sentry / BugSnag，改动点会散落到每个 errorComponent 里。收敛到这一处。
 */
export function reportError(error: unknown, errorInfo?: unknown): void {
    // 开发期连组件栈一起打——React 的 componentStack 是定位渲染期错误的主要线索
    if (import.meta.env.DEV) {
        console.error("[app-error]", error, errorInfo)
        return
    }
    // 生产期暂无监控服务：保留精简输出，便于用户报障时从控制台自查。
    // 接入监控时把 captureException 加在这里（上面这段可保留为兜底）。
    console.error("[app-error]", error)
}
