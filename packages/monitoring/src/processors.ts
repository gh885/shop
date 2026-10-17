// 事件加工链：出口组好完整事件之后、入队之前的最后一道。顺序收成一条数组、按 kind 分流，论证见 frontend-monitoring.md「装配」。两条看不出的口径：返回 undefined 即「不发」的唯一表达；加工器抛错视同丢弃，宁可少一条也不能绕过还没跑的脱敏。

import type { MonitoringEvent } from "./envelope"
import type { EventProcessor } from "./types"

/** 首次必报，之后 2 条用来发现「还在持续」，再多只是刷屏 */
const ERROR_LIMIT_PER_SESSION = 3

/** 纯内存常驻，超量清空——代价只是重复上报几条，不是丢数据 */
const SEEN_ERROR_CAPACITY = 200

const seenErrors = new Map<string, number>()

/**
 * 三端错误路径的最后一道闸（router defaultOnCatch 与全局 error 会双命中同一渲染错误）。键是指纹非 message 原文——订单号/金额不同的两条是同一个 bug，按原文限次等于没限。
 */
export const errorLimitProcessor: EventProcessor = {
    name: "error-limit",
    process(event) {
        if (event.kind !== "error") return event
        const key = event.fingerprint ?? `${event.name}::${event.message}`
        const seen = (seenErrors.get(key) ?? 0) + 1
        if (seenErrors.size > SEEN_ERROR_CAPACITY) seenErrors.clear()
        seenErrors.set(key, seen)
        return seen > ERROR_LIMIT_PER_SESSION ? undefined : event
    },
}

/**
 * 按 sessionId hash 决定这个会话是否上报性能事件，只作用于性能事件。按会话而非按事件采样——否则得到「一个会话贡献半条曲线」的扭曲分布；率取自信封快照（非当前配置），历史仍能按当时比例还原。
 */
export const samplingProcessor: EventProcessor = {
    name: "sampling",
    process(event) {
        if (event.kind !== "performance") return event
        return sampledSession(event.sessionId, event.sampleRate) ? event : undefined
    },
}

function sampledSession(sessionId: string, rate: number): boolean {
    if (rate >= 1) return true
    if (rate <= 0) return false
    // FNV-1a：分布够用且实现只有几行，比 crypto 便宜（每次性能事件都要算）
    let hash = 0x811c9dc5
    for (const char of sessionId) {
        hash ^= char.charCodeAt(0)
        hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash / 0xffffffff < rate
}

/** 顺序即执行顺序——今天两条按 kind 分流、互不重叠 */
export const DEFAULT_PROCESSORS: EventProcessor[] = [errorLimitProcessor, samplingProcessor]

/** 一次装配就是一个新实例，带过旧计数会让「首次必报」在重装后失效（主要是测试语义） */
export function resetErrorLimits(): void {
    seenErrors.clear()
}

/** 短路：任何一环返回 undefined（丢这条）就不再往下跑 */
export function applyProcessors(
    chain: readonly EventProcessor[],
    event: MonitoringEvent,
): MonitoringEvent | undefined {
    let current: MonitoringEvent | undefined = event
    for (const processor of chain) {
        if (current === undefined) return undefined
        try {
            current = processor.process(current)
        } catch {
            // 放它过去等于绕过了可能还没跑的脱敏/裁剪
            return undefined
        }
    }
    return current
}
