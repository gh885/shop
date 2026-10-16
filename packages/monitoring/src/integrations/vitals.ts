/**
 * Web Vitals 采集插件（三端统一，LCP/INP/CLS）。本文件只管「什么时候取快照」，算法归 `web-vitals`；用标准版，不发 DOM 选择器/attribution。
 * 三条不可动的结构（见 `frontend-monitoring.md` §首批功能、§装配）：
 * 1. 库订阅**每页一次**（`web-vitals` 无退订口，重复 subscribe 叠加回调），故 `subscribed` 标志**不随卸载复位**，只有 `visibilitychange` 监听每次装配挂卸。
 * 2. 出口从 `ctx` 来、不 import 本包状态：卸载后再来指标无处可发，`flushPending` 直接返回，`pending` 样本留给下次装配。
 * 3. **微任务延后不能动**：transport 的 hidden 监听可能早于库的 hidden 监听，同步 flush 会把未定稿的 LCP/CLS 发出去、终值滞留到下次心跳（`vitals.test.ts` 钉住此顺序）。
 */

import { onCLS, onINP, onLCP, type CLSMetric, type INPMetric, type LCPMetric } from "web-vitals"

import type { WebVitalName } from "../envelope"
import type { Integration, MonitorContext } from "../types"

type Vital = Pick<CLSMetric | INPMetric | LCPMetric, "name" | "id" | "value">

/** 库订阅每页一次（见文件头第 1 条）。**卸载不复位** */
let subscribed = false

/** 当次生效的上下文。每次装配刷新；卸载时只在还指着自己那次时清掉 */
let currentCtx: MonitorContext | undefined

const reported = new Map<WebVitalName, string>()
const pending = new Map<WebVitalName, Vital>()

/**
 * 每次导航（含 bfcache 恢复）取第一次转后台时的快照；同一 id 后续更新不再入桶。
 * 不在可见时落桶：库可能在 bfcache 恢复后先报告 CLS=0，提前去重会吞掉后续真实位移。
 * SPA 切路由不重置指标；业务操作耗时需要另外埋点。
 */
export const webVitalsIntegration: Integration = {
    name: "web-vitals",
    setup(ctx) {
        if (
            typeof window === "undefined" ||
            typeof document === "undefined" ||
            typeof PerformanceObserver === "undefined"
        )
            return
        currentCtx = ctx
        if (!subscribed) {
            subscribed = true
            for (const observe of [onCLS, onINP, onLCP]) {
                try {
                    observe(report)
                } catch {
                    // 单个浏览器 API 不可用时不影响其余指标，更不能影响业务启动。
                }
            }
        }
        const onVisibilityChange = () => {
            // 等库自己的 hidden 监听取完 PerformanceObserver 缓冲，再发送之前缓存的 LCP 等终值。
            if (document.visibilityState === "hidden") void Promise.resolve().then(flushPending)
        }
        document.addEventListener("visibilitychange", onVisibilityChange)
        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange)
            if (currentCtx === ctx) currentCtx = undefined
        }
    },
}

function report(metric: Vital): void {
    if (!Number.isFinite(metric.value) || metric.value < 0) return
    pending.set(metric.name, { name: metric.name, id: metric.id, value: metric.value })
    if (document.visibilityState === "hidden") void Promise.resolve().then(flushPending)
}

function flushPending(): void {
    const ctx = currentCtx
    // 已卸载：没有出口可发。样本留在 pending 里，下次装配连同新的一起发
    if (!ctx) return
    for (const metric of pending.values()) {
        if (reported.get(metric.name) === metric.id) continue
        try {
            const viewport =
                typeof window.matchMedia === "function"
                    ? window.matchMedia("(max-width: 767px)").matches
                        ? "small"
                        : "large"
                    : "unknown"
            ctx.track({
                kind: "performance",
                name: metric.name,
                value: metric.value,
                metricId: metric.id,
                viewport,
            })
            reported.set(metric.name, metric.id)
        } catch {
            // 遥测与浏览器兼容性问题不外抛。
        }
    }
    // transport 的 hidden 监听可能早于库的回调；不能等下一次心跳才发终值。
    ctx.flush()
}
