/**
 * 本包的公共类型。**零运行时代码**——只被 `import type` 引用，因此永远不进依赖环：
 * `state.ts → types.ts`、`monitor.ts → types.ts`、三个插件 `→ types.ts`，全是单向。
 *
 * 分家理由：`envelope.ts` 管「事件长什么样」（纯函数 + 事件形状），这里管
 * 「监控怎么被装配、插件能碰到什么」。
 */

import type { AppName, Breadcrumb, MonitorPerformanceEvent } from "./envelope"
import type { Transport } from "./transport"

export interface MonitoringOptions {
    /** 哪一端 */
    app: AppName
    /** 构建标识，建议 git sha。缺省为 "dev"——它进了信封，别用空串糊 */
    version?: string
    /** 真实环境。缺省 "dev" */
    env?: string
    /** 接收路径的覆盖口。缺省由 `Transport` 的 `DEFAULT_ENDPOINT` 兜底（`/api/rum/events`） */
    endpoint?: string
    /**
     * 总开关。**默认开**：接收端（后端 `POST /api/rum/events`）已上线，遥测就该发。
     * 显式传 `false` 关掉——那是测试与「临时停一条链路」用的。
     */
    enabled?: boolean
    /** 性能事件采样率（0~1），默认 1 */
    sampleRate?: number
    /** 调试：把事件打控制台 */
    debug?: boolean
    /** 发送实现注入（测试 / SSR） */
    transport?: Transport
    /**
     * 白屏检测参数。缺省 rootSelector `#root`、delayMs 1500
     * （与退役的 `startSpaMonitoring` 默认值一致）。
     */
    blankScreen?: { rootSelector?: string; delayMs?: number }
    /**
     * 装哪些插件。默认**全开**（`monitor.ts` 的 `DEFAULT_INTEGRATIONS`）；要裁就传一个函数，
     * 它收到默认列表、返回你要的那批。**按实例同一性裁**，不用名字字符串：
     * `integrations: (defaults) => defaults.filter((i) => i !== blankScreenIntegration)`
     */
    integrations?: (defaults: Integration[]) => Integration[]
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

/**
 * 非错误类事件：PV、性能、接口、文案兜底。`track` 是它们的统一出口。
 *
 * 调用方只传**事件自己的字段**，信封（app/version/env/session/route/ts/…）由出口统一补。
 * 这是单一出口的价值：业务代码碰不到信封，也就不会在某处漏掉 `env` 或把真实 URL 当 route 报上去。
 *
 * 性能事件在出口做采样，业务事件不采样——错误与 PV 是分母，少一条分母就偏了。
 */
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

/**
 * 三个自由函数在 `MonitorContext` 里的形状。
 *
 * 为什么写成独立的类型别名而不是 `typeof captureError`：那会逼 `types.ts` 去 import
 * `state.ts`，而 `state.ts` 又要 import `types.ts`——环。这里只声明，`monitor.ts` 组 ctx 时
 * 由 TS 结构赋值校验「实现是否还长得一样」，漂了就是编译错误。
 */
export type CaptureError = (
    name: ErrorName,
    error: unknown,
    extra?: { requestId?: string; message?: string },
) => void

export type Track = (event: TrackEvent) => void

export type AddBreadcrumb = (category: Breadcrumb["category"], message: string) => void

/** 插件能碰到的全部出口。**不含**队列细节、不含插件间依赖、不含优先级 */
export interface MonitorContext {
    /** 规范化前的装配选项（只读）。blank-screen 从这里读 rootSelector / delayMs */
    readonly options: Readonly<MonitoringOptions>
    /** 发送器。插件自己不该直接 enqueue——除 flush 外一律走 captureError / track */
    readonly transport: Transport
    captureError: CaptureError
    track: Track
    addBreadcrumb: AddBreadcrumb
    /** 等价于 `flushMonitoring`：需要「把刚入队的立刻发出去」时用（vitals 的微任务收尾） */
    flush: () => void
}

/**
 * 采集插件：装一个采集能力，返回卸载函数。**只做采集，不负责发送。**
 *
 * 形状刻意只有两个成员——今天没有插件间依赖、优先级、异步装配的需求，加了就是空转的抽象。
 * `setup` 同步执行；装配失败由宿主 try/catch 兜住（监控装配崩了不能拦住应用启动）。
 */
export interface Integration {
    /** 稳定标识，给人看与调试用 */
    readonly name: string
    setup(ctx: MonitorContext): void | (() => void)
}

/** `createMonitor` 的返回：一个可卸载、可强制 flush 的监控实例 */
export interface Monitor {
    /**
     * 卸载本次装配挂上的全部监听与定时器。**不 flush、不重置单例状态**——
     * 所以卸载而未重装时，游离的 `captureError` / `track` 仍会按原配置上报（见 ADR 0007 的「代价」）。
     */
    dispose(): void
    /** 立刻把队列里的事件发出去（等价于 `flushMonitoring`） */
    flush(): void
}
