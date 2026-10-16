/**
 * 事件加工链：出口组好完整事件之后、入队之前的最后一道（Sentry processors / OTel SpanProcessor 那一层）。
 * 顺序收成一条数组、规则按 kind 分流，论证见 `frontend-monitoring.md`「装配」。两条代码里看不出的口径：
 * 返回 `undefined` 即「不发」的唯一表达；加工器抛错视同丢弃，宁可少一条也不能让它绕过还没跑的脱敏/裁剪原样溜出去。
 */

import type { MonitoringEvent } from "./envelope"
import type { EventProcessor } from "./types"

/** 同一会话同一错误最多报几条：首次必报，之后 2 条用来发现「它还在持续」，再多只是刷屏 */
const ERROR_LIMIT_PER_SESSION = 3

/** 限次表容量上限：纯内存常驻，几百个不同错误能把 Map 撑到几 MB。超量清空——代价只是重复上报几条，不是丢数据 */
const SEEN_ERROR_CAPACITY = 200

const seenErrors = new Map<string, number>()

/**
 * 错误限次：三端所有错误路径的最后一道闸（router `defaultOnCatch` 与全局 `error` 会双命中同一渲染错误）。
 * 键是**指纹**（出口已算好放进事件）而非 message 原文——订单号/金额不同的两条是同一个 bug，按原文限次等于没限。
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
 * 性能采样：按 `sessionId` hash 决定**这个会话**是否上报性能事件。只作用于性能事件，错误不受它影响。
 * 按会话而非按事件采样——否则会得到「一个会话贡献半条曲线」的扭曲分布；采样率取自事件信封的快照值
 * （不是当前配置），以后调了率历史数据仍能按当时记下的比例还原真实量。
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

/** 默认加工链。顺序即执行顺序——今天两条按 kind 分流、互不重叠，顺序不影响结果 */
export const DEFAULT_PROCESSORS: EventProcessor[] = [errorLimitProcessor, samplingProcessor]

/** 装配重来时复位限次表：一次装配就是一个新监控实例，带过旧计数会让「首次必报」在重装后失效（主要是测试语义） */
export function resetErrorLimits(): void {
    seenErrors.clear()
}

/** 按顺序跑一遍加工链。短路：任何一环返回 `undefined`（丢这条）就不再往下跑，后面没机会改主意 */
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
            // 加工器崩了：丢这条。放它过去等于绕过了可能还没跑的脱敏/裁剪
            return undefined
        }
    }
    return current
}
