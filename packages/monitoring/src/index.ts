/**
 * 前端监控的对外入口（barrel）。
 *
 * 业务代码只从 `@shop/monitoring` 拿 `captureError` / `track` 这几个函数，不直接依赖第三方
 * SDK；换监控后端时改动收在 `state.ts` 加一层转发。所以三端 router 的 `defaultOnCatch`、
 * 契约漂移的 `console.error` 锚点、i18n 缺 key 上报、曝光/点击上报，全部改走这里。
 *
 * 装配只有一个入口：`createMonitor`（`monitor.ts`）——默认装三个采集插件、可按实例裁剪、可卸载。
 * 发送端与接收端均已接通，默认启用；`enabled: false` 可临时关闭上报。
 *
 * 实际实现分在几个文件，这个文件只做转发：
 * - state.ts       ：运行期状态 + captureError / track / trackRoute / 用户与面包屑（单一出口本体）
 * - monitor.ts     ：createMonitor + 默认集成列表（唯一同时认识状态与插件的模块）
 * - types.ts       ：公共类型（零运行时，只被 `import type` 引用）
 * - envelope.ts    ：事件信封的纯函数（模板化 / 指纹 / 设备维度）
 * - transport.ts   ：sendBeacon / fetch(keepalive) 传输 + flush + 生命周期
 * - integrations/  ：三个采集插件，一个文件一个，只 `import type`（永不 import state.ts / monitor.ts）
 *   - errors.ts       ：globalErrorsIntegration（未捕获异常 / Promise 拒绝 / 资源加载失败）
 *   - blank-screen.ts ：isBlankScreen（纯函数）+ blankScreenIntegration（SPA 白屏）
 *   - vitals.ts       ：webVitalsIntegration（三端统一采集 LCP / INP / CLS）
 *
 * 装配写法三端一致，差别只在裁剪（web 是 SSR，不做白屏）：
 * `createMonitor({ app: "web", version, env, integrations: (d) => d.filter((i) => i !== blankScreenIntegration) })`
 */

export { createMonitor } from "./monitor"

export { blankScreenIntegration, isBlankScreen } from "./integrations/blank-screen"
export { globalErrorsIntegration } from "./integrations/errors"
export { webVitalsIntegration } from "./integrations/vitals"

export {
    addBreadcrumb,
    captureError,
    flushMonitoring,
    setMonitoringUser,
    track,
    trackRoute,
} from "./state"

export type {
    AddBreadcrumb,
    CaptureError,
    ErrorName,
    Integration,
    Monitor,
    MonitorContext,
    MonitoringOptions,
    Track,
    TrackEvent,
} from "./types"

export { deviceInfo, fingerprint, toRouteTemplate } from "./envelope"

export type {
    AppName,
    Breadcrumb,
    DeviceInfo,
    Envelope,
    MonitorApiEvent,
    MonitorErrorEvent,
    MonitorFallbackEvent,
    MonitorPerformanceEvent,
    MonitorRouteEvent,
    MonitoringEvent,
    ViewportSize,
    WebVitalName,
} from "./envelope"

export { DEFAULT_ENDPOINT, Transport } from "./transport"
