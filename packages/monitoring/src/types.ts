/**
 * 本包的公共类型。**零运行时代码**——只被 `import type` 引用，因此永远不进依赖环：
 * `state.ts → types.ts`、`monitor.ts → types.ts`、三个插件 `→ types.ts`，全是单向。
 *
 * 分家理由：`envelope.ts` 管「事件长什么样」（纯函数 + 事件形状），这里管
 * 「监控怎么被装配、插件能碰到什么」。
 */

import type { AppName, Breadcrumb, MonitorPerformanceEvent, MonitoringEvent } from "./envelope"

/**
 * 真正把字节送出去的那一步。`Transport` 负责队列、分批、退避与账本，**只把「怎么发」留给它**。
 *
 * 是函数而不是对象（不是「注入一个 Sender」）：队列、生命周期、账本这些都归 `Transport` 一家，
 * 注入方换掉的只有最后一跳。因此 `Transport` 永远是本包自己造的——挂心跳、看账本都不需要
 * 先判断「这个发送器有没有那一面」。
 *
 * 返回值表示「这次是否交出去了」：`sendBeacon` 在配额满时返回 false 而不抛错，
 * 那时队列必须留着等下次，别把事件丢了。
 */
export type SendFunction = (endpoint: string, body: string) => boolean

/**
 * 发送账本：这条链路**出了什么问题**的证据。
 *
 * 有了它，下面两件事才不是猜的：接收端是不是有一段时间不可用（`droppedQueueFull` 在涨），
 * 心跳是不是在空转（`flushes` 不涨而 `skippedWhileBackingOff` 在涨）。计数写了却没人读，
 * 等于没写——所以它经 `Monitor.stats()` 暴露出去。
 */
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

/**
 * 事件加工器：出口组好完整事件之后、入队之前的最后一道。
 *
 * 返回 `undefined` 表示丢弃这条；返回事件本身（或改写过的副本）表示放行。
 * 加工器抛错视同丢弃——宁可少一条，也不能让一条「本该被脱敏却因加工器崩了」的原始事件溜出去。
 */
export interface EventProcessor {
    /** 稳定标识，给人看与调试用 */
    readonly name: string
    process(event: MonitoringEvent): MonitoringEvent | undefined
}

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
    /** 最后一跳的发送实现注入（测试 / SSR）。队列与生命周期仍归包内，见 {@link SendFunction} */
    send?: SendFunction
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
    /**
     * 事件加工链。默认两条（错误限次 + 性能采样，见 `processors.ts`）；要加自己的就传一个函数，
     * 它收到默认链、返回最终要跑的那条——**返回数组的顺序即执行顺序**：
     *
     * ```ts
     * processors: (defaults) => [脱敏Processor, ...defaults]
     * ```
     */
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

/**
 * 插件能碰到的全部出口。**不含**队列细节、不含插件间依赖、不含优先级。
 *
 * 刻意**不给** `transport`：插件只做采集，入队与生命周期都是宿主的事。要立刻发就调 `flush`，
 * 其余一律走 `captureError` / `track`——给插件一个能直接 enqueue 的口子，它就会绕开加工链。
 */
export interface MonitorContext {
    /** 规范化前的装配选项（只读）。blank-screen 从这里读 rootSelector / delayMs */
    readonly options: Readonly<MonitoringOptions>
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
    /**
     * 发送账本的快照。
     *
     * 给谁用：排查「监控是不是在自己悄悄丢数据」。页面上出现「功能正常但看不到上报」时，
     * 先看这里——`droppedQueueFull` 在涨说明接收端长期不可用，`skippedWhileBackingOff`
     * 在涨而 `sent` 不动说明一直没人发成功。
     */
    stats(): Readonly<TransportStats>
}
