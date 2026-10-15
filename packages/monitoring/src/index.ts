/**
 * 前端监控的对外入口（barrel）。
 *
 * **公共/内部的界线就在这个文件**：这里导出的是「别的包可以依赖」的东西——业务出口
 * （`captureError` / `track` / …）、装配入口（`createMonitor`）、插件与加工链的扩展点。
 * 没在这里出现的都算内部件（`Transport` 类、`deviceInfo`、`fingerprint`、`DEFAULT_ENDPOINT`、
 * 各处理器实现），包内测试走相对路径直接引它们。
 *
 * 判据是「导出即契约」：导出去了，别的包就会用上，之后就改不动。所以宁少勿多——
 * 真需要新的出口时再加，那是一次有意识的决定，而不是当初顺手多写的一行。
 *
 * 发送端与接收端均已接通，默认启用；`enabled: false` 可临时关闭上报。
 *
 * 实际实现分在几个文件，这个文件只做转发：
 * - scope.ts       ：会话作用域（设备画像 / session_id / 用户 / 路由 / 面包屑）
 * - processors.ts  ：事件加工链（错误限次 + 性能采样）+ 处理器接口
 * - state.ts       ：运行期配置 + captureError / track / trackRoute（单一出口本体）
 * - monitor.ts     ：createMonitor + 默认集成列表 + 信封守卫
 * - types.ts       ：公共类型（零运行时，只被 `import type` 引用）
 * - envelope.ts    ：事件信封的纯函数（模板化 / 指纹 / 设备维度）
 * - transport.ts   ：sender 实现（sendBeacon / fetch(keepalive) + 队列 + 退避）
 * - integrations/  ：四个采集插件，一个文件一个，只 `import type`（永不 import state.ts / monitor.ts）
 *
 * 装配写法三端一致，差别只在裁剪（web 是 SSR，不做白屏）：
 * `createMonitor({ app: "web", version, env, integrations: (d) => d.filter((i) => i !== blankScreenIntegration) })`
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
 * 路由模板化：把 `/products/12345` 换成 `/products/$id`。
 *
 * 它住在本包（而不是只当内部件）是因为 `@shop/client` 也要用：接口事件与 PV 都要把
 * 「实际路径」变成有界标签，两边必须是**同一个**函数的输出，否则 `/shops/1/coupons`
 * 在一处是 `$id`、在另一处是原样，指标就按两套形状分裂了。
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
