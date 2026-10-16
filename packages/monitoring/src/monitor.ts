/**
 * 装配入口：`createMonitor` + 默认集成列表。
 * 唯一同时认识状态（`state.ts`）和插件的模块，插件间/插件与状态互不认识，故「插件→出口→插件」环结构上不可能。
 * 默认全开，裁 `integrations` 依据实例同一性而非名字。装配失败一律不外抛（贯穿全包）。装配模型见 `frontend-monitoring.md` §装配、`adr/0007-collector-assembly.md`。
 */

import { blankScreenIntegration } from "./integrations/blank-screen"
import { breadcrumbsIntegration } from "./integrations/breadcrumbs"
import { globalErrorsIntegration } from "./integrations/errors"
import { webVitalsIntegration } from "./integrations/vitals"
import { resetErrorLimits } from "./processors"
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

/** 当前这套的卸载函数。装配单例：再次装配先卸上一套，不卸即纯泄漏（StrictMode 下重装是常态） */
let activeDisposer: (() => void) | undefined

/** 装配监控。各端 `main.tsx` / 根路由调一次；幂等（先卸上一套），失败不外抛 */
export function createMonitor(options: MonitoringOptions): Monitor {
    activeDisposer?.()

    assertEnvelope(options)
    // 一次装配 = 一个新的监控实例，限次表跟着复位（见 resetErrorLimits 的注释）
    resetErrorLimits()
    const transport = applyOptions(options)
    const disposers: Array<() => void> = []

    // transport 的生命周期不是插件（它只有一个实现、只干一件事），由宿主直接管，但同样要能卸
    if (monitoringEnabled()) {
        disposers.push(transport.bindLifecycle(), transport.startHeartbeat())
    }

    const ctx: MonitorContext = {
        options,
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
    return {
        dispose,
        flush: flushMonitoring,
        stats: () => transport.snapshot(),
    }
}

/** 生产环境名。信封里写 `prod` 是 `application-prod.yml` 那一套口径，别在这里发明第三种写法 */
const PROD_ENVS: ReadonlySet<string> = new Set(["prod", "production"])

/** `version` 的缺省值。它同时也是「构建期没注入」的信号，见 assertEnvelope */
const DEV_VERSION = "dev"

/**
 * 信封守卫：prod 但 version 仍是缺省 `"dev"` 时 `console.error`（不抛——装配失败绝不拦启动）。
 * 漏注入 `VITE_APP_VERSION` 全程不报错，而信封发出即改不回（历史按当时 schema 存，见 observability.md 契约第 2 条），只能装配时喊。
 */
function assertEnvelope(options: MonitoringOptions): void {
    if (!PROD_ENVS.has(options.env ?? "")) return
    if (options.version && options.version !== DEV_VERSION) return
    console.error(
        `[monitoring] env=${options.env} 但 version=${options.version ?? `(缺省 ${DEV_VERSION})`}：` +
            "构建期没注入 VITE_APP_VERSION，这批上报的信封错定了，且事后改不回来。",
    )
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
