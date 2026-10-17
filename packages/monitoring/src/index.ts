// 前端监控对外入口（barrel）。公共/内部的界线就在这个文件：这里导出的是别的包可依赖的出口，没出现的都算内部件。判据「导出即契约」——宁少勿多。

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

/** 导出而非内部件：@shop/client 与 PV 必须用同一个函数的输出，否则同一路径两处标签形状不一、指标按两套形状分裂 */
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
