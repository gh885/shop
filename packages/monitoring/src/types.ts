/** 本包公共类型（零运行时代码，只被 `import type` 引用，故永不进依赖环）。装配 / 插件契约见 docs/conventions/frontend-monitoring.md 与 docs/adr/0007-collector-assembly.md。 */

import type { AppName, Breadcrumb, MonitorPerformanceEvent, MonitoringEvent } from "./envelope"

/** 最后一跳发送实现：返回「这次是否交出去」——`sendBeacon` 配额满返回 false 不抛错，队列须留着等下次、别丢事件。队列 / 分批 / 退避归 `Transport`，见 docs/conventions/frontend-monitoring.md。 */
export type SendFunction = (endpoint: string, body: string) => boolean

/** 发送账本：这条链路出了什么问题的证据，经 `Monitor.stats()` 暴露。各计数语义见 docs/conventions/frontend-monitoring.md。 */
export interface TransportStats {
    /** 真的交出去的条数 */
    sent: number
    /** 因为队列封顶被丢掉的条数。持续增长 = 接收端有段时间不可用 */
    droppedQueueFull: number
    /** 发送被拒（`send` 返回 false）而放回队列的条数 */
    sendFailed: number
    /** flush 调用次数（含队列为空时的空转） */
    flushes: number
    /** 跳过的 flush 次数（退避窗口内） */
    skippedWhileBackingOff: number
}

/** 事件加工器（出口组好事件后、入队前的最后一道）：返回 `undefined` 丢弃、返回事件放行；抛错视同丢弃——绝不让本该被脱敏的原始事件溜出去。 */
export interface EventProcessor {
    /** 稳定标识，给人看与调试用 */
    readonly name: string
    process(event: MonitoringEvent): MonitoringEvent | undefined
}

export interface MonitoringOptions {
    app: AppName
    /** 构建标识，建议 git sha。缺省为 "dev"——它进了信封，别用空串糊 */
    version?: string
    /** 真实环境。缺省 "dev" */
    env?: string
    /** 接收路径的覆盖口。缺省由 `Transport` 的 `DEFAULT_ENDPOINT` 兜底（`/api/rum/events`） */
    endpoint?: string
    /** 总开关，默认开（接收端已上线）；显式传 `false` 关掉，用于测试与临时停一条链路 */
    enabled?: boolean
    /** 性能事件采样率（0~1），默认 1 */
    sampleRate?: number
    /** 调试：把事件打控制台 */
    debug?: boolean
    /** 最后一跳的发送实现注入（测试 / SSR）。队列与生命周期仍归包内，见 {@link SendFunction} */
    send?: SendFunction
    /** 白屏检测参数，缺省 rootSelector `#root`、delayMs 1500 */
    blankScreen?: { rootSelector?: string; delayMs?: number }
    /** 装哪些插件，默认全开（`DEFAULT_INTEGRATIONS`）；传函数按实例同一性裁（非名字字符串），见 docs/conventions/frontend-monitoring.md（§装配） */
    integrations?: (defaults: Integration[]) => Integration[]
    /** 事件加工链，默认两条（错误限次 + 性能采样，见 `processors.ts`）；传函数增删，返回数组顺序即执行顺序 */
    processors?: (defaults: EventProcessor[]) => EventProcessor[]
}

/** 事件名白名单：受控枚举，别用动态串（它会变成指标标签，基数随之膨胀） */
export type ErrorName =
    | "js_error"
    | "unhandled_rejection"
    | "route_error"
    | "hydration_error"
    | "blank_screen"
    | "api_contract_drift"
    | "i18n_missing_key"
    | "i18n_missing_param"
    | "i18n_invalid_message"
    | "resource_load_error"
    | "custom"

/** 非错误类事件（PV / 性能 / 接口 / 文案兜底）统一出口 `track`：调用方只传事件自己的字段，信封由出口补（单一出口，业务碰不到信封也就不漏字段）。性能事件出口采样、业务事件不采样（错误与 PV 是分母）。 */
export type TrackEvent =
    | Pick<MonitorPerformanceEvent, "kind" | "name" | "value" | "metricId" | "viewport">
    | { kind: "route"; to: string; duration?: number }
    | {
          kind: "api"
          endpoint: string
          method: string
          status: number
          duration: number
          message?: string
          requestId?: string
      }
    /** 文案兜底：不采样、不限次——它就是频次本身（详见 envelope.ts 的 MonitorFallbackEvent） */
    | {
          kind: "fallback"
          source: "detail" | "status"
          status: number
          code?: string
          detail?: string
      }

/** 三个自由函数在 `MonitorContext` 里的形状；写成独立别名而非 `typeof captureError`，避开 `types ↔ state` 的 import 环（`monitor.ts` 组 ctx 时由 TS 结构赋值校验实现是否仍一致）。 */
export type CaptureError = (
    name: ErrorName,
    error: unknown,
    extra?: { requestId?: string; message?: string },
) => void

export type Track = (event: TrackEvent) => void

export type AddBreadcrumb = (category: Breadcrumb["category"], message: string) => void

/** 插件能碰到的全部出口；刻意不含 `transport`——给插件一个 enqueue 口子它就会绕开加工链，要立刻发只调 `flush`。 */
export interface MonitorContext {
    /** 规范化前的装配选项（只读）。blank-screen 从这里读 rootSelector / delayMs */
    readonly options: Readonly<MonitoringOptions>
    captureError: CaptureError
    track: Track
    addBreadcrumb: AddBreadcrumb
    /** 等价于 `flushMonitoring`：需要「把刚入队的立刻发出去」时用（vitals 的微任务收尾） */
    flush: () => void
}

/** 采集插件：装一个采集能力、返回卸载函数；只做采集不负责发送。`setup` 同步执行，装配失败由宿主 try/catch 兜住（不能拦住应用启动）。 */
export interface Integration {
    /** 稳定标识，给人看与调试用 */
    readonly name: string
    setup(ctx: MonitorContext): void | (() => void)
}

/** `createMonitor` 的返回：一个可卸载、可强制 flush 的监控实例 */
export interface Monitor {
    /** 卸载本次装配挂上的监听与定时器。不 flush、不重置单例——卸载而未重装时游离的 `captureError` / `track` 仍按原配置上报（ADR 0007「代价」） */
    dispose(): void
    /** 立刻把队列里的事件发出去（等价于 `flushMonitoring`） */
    flush(): void
    /** 发送账本快照：排查「监控是不是在悄悄丢数据」（各计数语义见 TransportStats） */
    stats(): Readonly<TransportStats>
}
