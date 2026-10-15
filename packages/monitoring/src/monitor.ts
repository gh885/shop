/**
 * 装配入口：`createMonitor` + 默认集成列表。
 *
 * 这是**唯一**同时认识状态（`state.ts`）和插件的模块。插件之间、插件与状态之间都不互相认识：
 * 插件只从这里的 `ctx` 拿到出口，所以「插件 → 出口 → 插件」这种环在结构上不可能出现
 * （原先 `index.ts ↔ blank-screen/vitals` 那个环就是靠拆出本模块消掉的）。
 *
 * 三端各自的装配就是这一句 + 各自的裁剪：
 *
 * ```ts
 * createMonitor({ app: "seller", version: VITE_APP_VERSION, env: VITE_APP_ENV })
 * ```
 *
 * 默认**全开**；要裁传 `integrations`（收到默认列表，返回你要的那批）。裁的依据是
 * **实例同一性**而不是名字字符串——改名不会静默失效：
 *
 * ```ts
 * integrations: (defaults) => defaults.filter((i) => i !== blankScreenIntegration)
 * ```
 *
 * 装配失败一律不外抛：一个报错的前端比没有监控的前端更糟（这条贯穿全包）。
 */

import { blankScreenIntegration } from "./integrations/blank-screen"
import { breadcrumbsIntegration } from "./integrations/breadcrumbs"
import { globalErrorsIntegration } from "./integrations/errors"
import { webVitalsIntegration } from "./integrations/vitals"
import {
    addBreadcrumb,
    applyOptions,
    captureError,
    flushMonitoring,
    monitoringEnabled,
    track,
} from "./state"
import type { Integration, Monitor, MonitorContext, MonitoringOptions } from "./types"

/** 默认集成：全开。顺序即安装顺序（今天彼此独立，顺序不影响结果） */
const DEFAULT_INTEGRATIONS: Integration[] = [
    globalErrorsIntegration,
    webVitalsIntegration,
    blankScreenIntegration,
    breadcrumbsIntegration,
]

/**
 * 当前这一套的卸载函数。装配是**单例**的：同一时刻只有一套监控在跑，
 * 再次装配先卸上一套——不卸就是纯泄漏（旧实现每装一次多一个 30s 定时器和两组 window 监听，
 * 且永远拆不掉；web 的装配挂在 `useEffect` 里，dev 下 StrictMode 会把这件事变成常态）。
 */
let activeDisposer: (() => void) | undefined

/**
 * 装配监控。各端在 `main.tsx` / 根路由里调一次。
 *
 * 幂等：重复调用会先卸掉上一套再装新的。之所以不 throw——监控装配失败绝不能拦住应用启动。
 */
export function createMonitor(options: MonitoringOptions): Monitor {
    activeDisposer?.()

    const transport = applyOptions(options)
    const disposers: Array<() => void> = []

    // transport 的生命周期不是插件（它只有一个实现、只干一件事），由宿主直接管，但同样要能卸
    if (monitoringEnabled()) {
        disposers.push(transport.bindLifecycle(), transport.startHeartbeat())
    }

    const ctx: MonitorContext = {
        options,
        transport,
        captureError,
        track,
        addBreadcrumb,
        flush: flushMonitoring,
    }

    const integrations = options.integrations
        ? options.integrations(DEFAULT_INTEGRATIONS)
        : DEFAULT_INTEGRATIONS
    for (const integration of integrations) {
        const dispose = safeSetup(integration, ctx)
        if (dispose) disposers.push(dispose)
    }

    if (options.debug)
        console.debug("[monitoring] configured", {
            app: options.app,
            env: options.env ?? "dev",
            enabled: monitoringEnabled(),
        })

    const dispose = () => {
        // LIFO：后装的先卸（依赖关系上总是后者依赖前者）。splice 顺手清空，重复调用即空转
        for (const d of disposers.splice(0).toReversed()) safeCall(d)
        // 只在句柄还指着自己时才清：先被换掉、事后再 dispose 那个旧实例，
        // 不该把新实例的句柄一起抹掉（否则下一次装配就卸不掉它了）
        if (activeDisposer === dispose) activeDisposer = undefined
    }
    activeDisposer = dispose
    return { dispose, flush: flushMonitoring }
}

/** 插件装配失败不外抛，也不影响其余插件——一个坏插件不能带走整套监控 */
function safeSetup(integration: Integration, ctx: MonitorContext): (() => void) | undefined {
    try {
        const dispose = integration.setup(ctx)
        return typeof dispose === "function" ? dispose : undefined
    } catch {
        return undefined
    }
}

/** 卸载失败同样不外抛 */
function safeCall(fn: () => void): void {
    try {
        fn()
    } catch {
        // 故意吞掉
    }
}
