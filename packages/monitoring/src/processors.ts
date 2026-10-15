/**
 * 事件加工链：出口组好完整事件之后、入队之前的最后一道
 * （Sentry 的 processors / OpenTelemetry 的 SpanProcessor 那一层）。
 *
 * 为什么要独立成一层：加工规则此前散在三处——性能采样在 `track`、错误限次在 `captureError`、
 * 序列化裁剪在传输层。想加第四条规则时得先判断「该插在哪一步」，而**插错位置是静默的**：
 * 表现为「少报了一条」或「多报了一条」，都不报错。收成一条链之后，顺序变成数据（一个数组），
 * 不再是代码位置。
 *
 * 三条口径：
 * - **一条规则只管一类事件**：认不出来的 kind 原样放行（`return event`），所以规则之间不互相依赖，
 *   增减一条也不会影响别的 kind
 * - **返回 `undefined` 即丢弃**：这是唯一的「不发」表达，没有别的旁路
 * - **加工器抛错视同丢弃**：见 `EventProcessor` 的注释——宁可少一条，也不能让一条本该被加工
 *   却因加工器崩了而原样溜出去
 */

import type { MonitoringEvent } from "./envelope"
import type { EventProcessor } from "./types"

/** 同一会话同一错误最多报几条：首次必报，之后 2 条用来发现「它还在持续」，再多只是刷屏 */
const ERROR_LIMIT_PER_SESSION = 3

/**
 * 限次表的容量上限。一次会话里几百个不同错误（比如轮询接口持续失败）能把 Map 撑到几 MB，
 * 而它是纯内存常驻。超量时清空——最坏后果只是重复上报几条，不是丢数据。
 */
const SEEN_ERROR_CAPACITY = 200

const seenErrors = new Map<string, number>()

/**
 * 错误限次：三端所有错误路径的最后一道闸。
 *
 * 需要它是因为同一个问题会被报很多次，而有两条路是**结构性**的重复，不是偶发：
 * - router 的 `defaultOnCatch` 与全局 `error` 监听会同时命中同一个渲染错误，各报一次就翻倍
 * - 循环依赖的组件会反复抛同一个错
 *
 * 限次的键是**指纹**（出口已经算好放进事件），不是 message 原文——订单号、金额不同的两条
 * 报错是同一个 bug，按原文限次等于没限。
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
 * 性能采样：按 `sessionId` 的 hash 决定**这个会话**是否上报性能事件。
 *
 * 按会话而非按事件采样：同一会话内要么全报要么全不报，性能指标的分布才有意义
 * （按事件随机抽会得到「一个会话贡献了半条曲线」的扭曲分布）。
 *
 * 采样率取自**事件信封里的那个值**（上报当时的快照），不是当前配置：以后调了采样率，
 * 历史数据仍能按当时记下的比例还原成真实量（契约第 1 条）。
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

/**
 * 装配重来时复位限次表。
 *
 * 为什么跟着装配走而不是跟着会话走：一次装配就是一个新的监控实例，把上一份装配的计数
 * 带过来会让「首次必报」这条保证在重装后失效。生产里只装配一次，这主要是测试语义。
 */
export function resetErrorLimits(): void {
    seenErrors.clear()
}

/**
 * 按顺序跑一遍加工链。返回 `undefined` 即这条事件不发。
 *
 * 短路：任何一环丢掉就不再往下跑——后面的加工器没有机会改主意。
 */
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
