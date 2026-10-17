// 装配入口：createMonitor + 默认集成列表。唯一同时认识状态与插件的模块，故「插件→出口→插件」环结构上不可能。装配模型见 frontend-monitoring.md §装配、adr/0007。

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

/** 默认全开。顺序即安装顺序（今天彼此独立，不影响结果） */
const DEFAULT_INTEGRATIONS: Integration[] = [
    globalErrorsIntegration,
    webVitalsIntegration,
    blankScreenIntegration,
    breadcrumbsIntegration,
]

/** 装配单例：再次装配先卸上一套，不卸即纯泄漏（StrictMode 下重装是常态） */
let activeDisposer: (() => void) | undefined

/** 各端 main.tsx/根路由调一次；幂等（先卸上一套），失败不外抛 */
export function createMonitor(options: MonitoringOptions): Monitor {
    activeDisposer?.()

    assertEnvelope(options)
    // 一次装配=一个新实例，限次表跟着复位
    resetErrorLimits()
    const transport = applyOptions(options)
    const disposers: Array<() => void> = []

    // transport 生命周期不是插件（只一个实现、只干一件事），由宿主直接管，同样要能卸
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
        // LIFO：后装的先卸（后者总依赖前者）。splice 顺手清空，重复调用即空转
        for (const d of disposers.splice(0).toReversed()) safeCall(d)
        // 只在句柄还指着自己时才清：先被换掉、事后 dispose 那个旧实例不该抹掉新实例句柄
        if (activeDisposer === dispose) activeDisposer = undefined
    }
    activeDisposer = dispose
    return {
        dispose,
        flush: flushMonitoring,
        stats: () => transport.snapshot(),
    }
}

/** 信封里写 prod 是 application-prod.yml 的口径，别发明第三种写法 */
const PROD_ENVS: ReadonlySet<string> = new Set(["prod", "production"])

/** 同时也是「构建期没注入」的信号，见 assertEnvelope */
const DEV_VERSION = "dev"

/**
 * prod 但 version 仍缺省 "dev" 时 console.error（不抛——装配失败绝不拦启动）。漏注入全程不报错而信封发出即改不回，只能装配时喊（observability.md 第 2 条）。
 */
function assertEnvelope(options: MonitoringOptions): void {
    if (!PROD_ENVS.has(options.env ?? "")) return
    if (options.version && options.version !== DEV_VERSION) return
    console.error(
        `[monitoring] env=${options.env} 但 version=${options.version ?? `(缺省 ${DEV_VERSION})`}：` +
            "构建期没注入 VITE_APP_VERSION，这批上报的信封错定了，且事后改不回来。",
    )
}

/** 一个坏插件不能带走整套监控 */
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
