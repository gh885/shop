/**
 * 前端监控的对外入口（barrel）。
 *
 * 业务代码只从 `@shop/monitoring` 拿 `captureError` / `track` 这几个函数，不直接依赖第三方
 * SDK；换监控后端时改动收在 `core.ts` 加一层转发。所以三端 router 的 `defaultOnCatch`、
 * 契约漂移的 `console.error` 锚点、i18n 缺 key 上报、曝光/点击上报，全部改走这里。
 *
 * 实际实现分在几个文件，这个文件只做转发：
 * - core.ts    ：运行期状态 + captureError / track / configureMonitoring（单一出口本体）
 * - envelope.ts：事件信封的纯函数（模板化 / 指纹 / 设备维度）
 * - transport.ts：sendBeacon / fetch(keepalive) 传输 + flush + 生命周期
 * - blank-screen.ts：SPA 白屏检测 + startSpaMonitoring（seller/admin 入口用）
 * - vitals.ts  ：Web Vitals（三端统一采集）
 *
 * 当前状态：**发送端已就位，接收端没有**。所以 `configureMonitoring` 传入
 * `enabled: false`（默认）时不发任何事件——装了监控却没地方收，白发的事件是纯噪声。
 */

export {
    addBreadcrumb,
    bindGlobalListeners,
    captureError,
    configureMonitoring,
    monitoringUser,
    setMonitoringUser,
    track,
    trackRoute,
    type ErrorName,
    type MonitoringOptions,
    type TrackEvent,
} from "./core"

export {
    deviceInfo,
    fingerprint,
    toRouteTemplate,
    type AppName,
    type Breadcrumb,
    type Envelope,
    type MonitorApiEvent,
    type MonitorErrorEvent,
    type MonitorFallbackEvent,
    type MonitorPerformanceEvent,
    type MonitorRouteEvent,
    type MonitoringEvent,
} from "./envelope"

export { DEFAULT_ENDPOINT, Transport } from "./transport"

export { isBlankScreen, monitorBlankScreen, startSpaMonitoring } from "./blank-screen"

export { bindWebVitals } from "./vitals"
