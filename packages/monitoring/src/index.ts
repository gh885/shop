/**
 * 前端监控对外入口（barrel）。**公共/内部的界线就在这个文件**：这里导出的是别的包可依赖的出口，
 * 没出现的都算内部件（包内测试走相对路径直接引）。判据「导出即契约」——宁少勿多。
 * 各文件职责与装配见 `monitor.ts` / `frontend-monitoring.md`。发送与接收均已接通，默认启用，`enabled: false` 可临时关。
 */

export { createMonitor } from "./monitor"

export { blankScreenIntegration, isBlankScreen } from "./integrations/blank-screen"
export { breadcrumbsIntegration } from "./integrations/breadcrumbs"
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

/**
 * 路由模板化 `/products/123` → `/products/$id`。导出（而非只当内部件）是因为 `@shop/client` 与 PV 必须用
 * **同一个**函数的输出，否则同一路径两处标签形状不一、指标按两套形状分裂。
 */
export { toRouteTemplate } from "./envelope"

export type {
    AddBreadcrumb,
    CaptureError,
    ErrorName,
    EventProcessor,
    Integration,
    Monitor,
    MonitorContext,
    MonitoringOptions,
    SendFunction,
    Track,
    TrackEvent,
} from "./types"

export type {
    AppName,
    Breadcrumb,
    Envelope,
    MonitorApiEvent,
    MonitorErrorEvent,
    MonitorFallbackEvent,
    MonitorPerformanceEvent,
    MonitorRouteEvent,
    MonitoringEvent,
} from "./envelope"
