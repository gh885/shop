import { onCLS, onINP, onLCP, type CLSMetric, type INPMetric, type LCPMetric } from "web-vitals"

import { flushMonitoring, track } from "./core"
import type { WebVitalName } from "./envelope"

type Vital = Pick<CLSMetric | INPMetric | LCPMetric, "name" | "id" | "value">
let bound = false
const reported = new Map<WebVitalName, string>()
const pending = new Map<WebVitalName, Vital>()

/**
 * 每次导航（含 bfcache 恢复）取第一次转后台时的快照；同一 id 后续更新不再入桶。
 * 不在可见时落桶：库可能在 bfcache 恢复后先报告 CLS=0，提前去重会吞掉后续真实位移。
 * SPA 切路由不重置指标；业务操作耗时需要另外埋点。
 */
export function bindWebVitals(): void {
    if (
        bound ||
        typeof window === "undefined" ||
        typeof document === "undefined" ||
        typeof PerformanceObserver === "undefined"
    )
        return
    bound = true
    for (const observe of [onCLS, onINP, onLCP]) {
        try {
            observe(report)
        } catch {
            // 单个浏览器 API 不可用时不影响其余指标，更不能影响业务启动。
        }
    }
    document.addEventListener("visibilitychange", () => {
        // 等库自己的 hidden 监听取完 PerformanceObserver 缓冲，再发送之前缓存的 LCP 等终值。
        if (document.visibilityState === "hidden") void Promise.resolve().then(flushPending)
    })
}

function report(metric: Vital): void {
    if (!Number.isFinite(metric.value) || metric.value < 0) return
    pending.set(metric.name, { name: metric.name, id: metric.id, value: metric.value })
    if (document.visibilityState === "hidden") void Promise.resolve().then(flushPending)
}

function flushPending(): void {
    for (const metric of pending.values()) {
        if (reported.get(metric.name) === metric.id) continue
        try {
            const viewport =
                typeof window.matchMedia === "function"
                    ? window.matchMedia("(max-width: 767px)").matches
                        ? "small"
                        : "large"
                    : "unknown"
            track({
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
    flushMonitoring()
}
