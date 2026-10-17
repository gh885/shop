// 本包公共类型（零运行时代码，只被 import type 引用，故永不进依赖环）。装配/插件契约见 frontend-monitoring.md 与 docs/adr/0007-collector-assembly.md。

import type { AppName, Breadcrumb, MonitorPerformanceEvent, MonitoringEvent } from "./envelope"

/** 返回「这次是否交出去」——sendBeacon 配额满返回 false 不抛错，队列须留着等下次、别丢事件。队列/分批/退避归 Transport */
export type SendFunction = (endpoint: string, body: string) => boolean

/** 发送账本：这条链路出问题的证据，经 Monitor.stats() 暴露。各计数语义见 frontend-monitoring.md */
export interface TransportStats {
    sent: number
    /** 持续增长 = 接收端有段时间不可用 */
    droppedQueueFull: number
    sendFailed: number
    flushes: number
    skippedWhileBackingOff: number
}

/** 出口组好事件后、入队前的最后一道：返回 undefined 丢弃、返回事件放行；抛错视同丢弃——绝不让本该被脱敏的原始事件溜出去 */
export interface EventProcessor {
    readonly name: string
    process(event: MonitoringEvent): MonitoringEvent | undefined
}

export interface MonitoringOptions {
    app: AppName
    /** 建议 git sha。缺省 "dev"——它进了信封，别用空串糊 */
    version?: string
    env?: string
    endpoint?: string
    /** 默认开；显式 false 关掉，用于测试与临时停一条链路 */
    enabled?: boolean
    /** 性能事件采样率（0~1），默认 1 */
    sampleRate?: number
    debug?: boolean
    send?: SendFunction
    blankScreen?: { rootSelector?: string; delayMs?: number }
    /** 默认全开；传函数按实例同一性裁（非名字字符串），见 frontend-monitoring.md §装配 */
    integrations?: (defaults: Integration[]) => Integration[]
    /** 默认两条（错误限次 + 性能采样，见 processors.ts）；返回数组顺序即执行顺序 */
    processors?: (defaults: EventProcessor[]) => EventProcessor[]
}

/** 受控枚举，别用动态串——它会变成指标标签，基数随之膨胀 */
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

/** 非错误类事件统一出口 track：调用方只传事件自己的字段，信封由出口补（单一出口，业务碰不到信封也就不漏字段）。性能事件出口采样、业务事件不采样 */
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
    | {
          kind: "fallback"
          source: "detail" | "status"
          status: number
          code?: string
          detail?: string
      }

/** 写成独立别名而非 `typeof captureError`，避开 types↔state 的 import 环（monitor.ts 组 ctx 时由 TS 结构赋值校验实现是否仍一致） */
export type CaptureError = (
    name: ErrorName,
    error: unknown,
    extra?: { requestId?: string; message?: string },
) => void

export type Track = (event: TrackEvent) => void

export type AddBreadcrumb = (category: Breadcrumb["category"], message: string) => void

/** 刻意不含 transport——给插件一个 enqueue 口子它就会绕开加工链，要立刻发只调 flush */
export interface MonitorContext {
    readonly options: Readonly<MonitoringOptions>
    captureError: CaptureError
    track: Track
    addBreadcrumb: AddBreadcrumb
    /** 需要「把刚入队的立刻发出去」时用（vitals 的微任务收尾） */
    flush: () => void
}

/** setup 同步执行，装配失败由宿主 try/catch 兜住（不能拦住应用启动） */
export interface Integration {
    readonly name: string
    setup(ctx: MonitorContext): void | (() => void)
}

export interface Monitor {
    /** 不 flush、不重置单例——卸载而未重装时游离的 captureError/track 仍按原配置上报（ADR 0007「代价」） */
    dispose(): void
    flush(): void
    /** 排查「监控是不是在悄悄丢数据」（各计数语义见 TransportStats） */
    stats(): Readonly<TransportStats>
}
