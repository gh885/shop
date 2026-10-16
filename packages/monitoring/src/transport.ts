/**
 * 传输层：把事件送到接收端的那一段。硬要求与论证见 `frontend-monitoring.md`「传输」条，
 * 此处只留代码里看不出的坑：body 用 `text/plain` 避 CORS 预检；flush 挂 `visibilitychange`/`pagehide`
 * 而非 `unload`（移动端基本不触发）；拼包用 `[a,b,c]` 而非 `JSON.stringify([a,b,c])`，否则引号再转义一层、
 * body 翻倍会撞 beacon 配额（约 64KB）被静默丢弃。发送端可换：只认 `MonitoringEvent[]`，换后端改这一个文件。
 */

import type { SendFunction, TransportStats } from "./types"

/** 接收端路径：自己域名下的固定路径（契约第 3 条「上报发往自己域名下的固定路径」） */
export const DEFAULT_ENDPOINT = "/api/rum/events"

/** 单次批量的事件数上限：超了分批发。攒太多会让 beacon 的 body 超过浏览器配额（约 64KB）而被静默丢弃 */
const MAX_BATCH = 50

/**
 * 队列长度上限，必须封顶：接收端长期不可用时队列只进不出、纯内存常驻，吃的是业务页内存。
 * 到顶丢**最旧的**（不是最新的）——新事件更可能对应正在发生的问题。
 */
const MAX_QUEUE = 500

/** 退避起点与上限：连续失败时 1s → 2s → 4s …… 封顶 60s */
const BACKOFF_BASE_MS = 1_000
const BACKOFF_MAX_MS = 60_000

/**
 * 传输器选项。队列进内存而非 localStorage：事件带 route/错误栈/偶发 userId，
 * 写进 localStorage 就是持久化个人数据且清不掉。
 */
export interface TransportOptions {
    /** 接收路径，默认 `/api/rum/events` */
    endpoint?: string
    /** 最后一跳的发送实现。注入是为了测试与 SSR 场景（SSR 没有 fetch/sendBeacon），见 {@link SendFunction} */
    send?: SendFunction
    /** 调试开关：把发出去的东西打控制台。默认关——生产开着等于往用户控制台倒垃圾 */
    debug?: boolean
}

/**
 * 浏览器发送实现：优先 `sendBeacon`（页面卸载时唯一还能送达的方式），退 `fetch(keepalive)`。
 * 返回值=「这次是否交出去」，决定能否清队列；`sendBeacon` 配额满时返回 false 而不抛错，此时必须留着别丢。
 * 已知盲区：`fetch` 那一支是「已发出」非「送达」，真实网络失败这里数不到，靠队列封顶与退避兜底。
 */
function browserSend(endpoint: string, body: string): boolean {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        try {
            // 空 type 的 Blob 会被浏览器当成 text/plain 发出去（传字符串时的默认类型）
            if (
                navigator.sendBeacon(
                    endpoint,
                    new Blob([body], { type: "text/plain;charset=UTF-8" }),
                )
            ) {
                return true
            }
        } catch {
            // 配额满、页面卸载中、或 endpoint 跨域被拦——都往下退到 fetch
        }
    }
    if (typeof fetch === "function") {
        try {
            void fetch(endpoint, {
                method: "POST",
                body,
                // text/plain 属简单请求，避开 CORS 预检（见文件头）
                headers: { "Content-Type": "text/plain;charset=UTF-8" },
                // keepalive 让请求在页面卸载后继续走完——sendBeacon 不可用时的替代保命手段
                keepalive: true,
                // 上报不该被业务 cookie 带上，也不该触发任何拦截器；credentials 显式关掉
                credentials: "omit",
            }).catch(() => {})
            return true
        } catch {
            return false
        }
    }
    return false
}

/** 空闲 flush 的调度句柄。两种实现（idle / timeout）的取消方式不同，统一成一个形状 */
interface IdleHandle {
    cancel(): void
}

/** 把一次 flush 排到浏览器空闲时（没有 `requestIdleCallback` 退 `setTimeout`）：上报不跟首屏抢主线程 */
function scheduleIdleFlush(run: () => void): IdleHandle {
    if (typeof requestIdleCallback === "function") {
        const id = requestIdleCallback(run)
        return { cancel: () => cancelIdleCallback(id) }
    }
    const id = setTimeout(run, 0)
    return { cancel: () => clearTimeout(id) }
}

/**
 * 传输器：队列 + 分批 + 退避 + 账本 + 生命周期钩子。本包唯一发送实现，出口换掉的只是最后一跳
 * （{@link SendFunction}）。做成实例（非模块单例）让三端各自装配显式拿对象、单测能注入假发送。
 * `bindLifecycle`/`startHeartbeat` **返回卸载函数**：装配会重跑（dev 下 StrictMode 跑两遍），
 * 不卸载就是每装一次多一个监听、多一个定时器。
 */
export class Transport {
    private readonly queue: string[] = []
    private readonly endpoint: string
    private readonly send: SendFunction
    private readonly debug: boolean
    private listenerBound = false
    /** 连续失败次数，退避的指数 */
    private consecutiveFailures = 0
    /** 退避截止时刻。在此之前 flush 直接跳过，不去撞一个已知不通的接收端 */
    private backoffUntil = 0
    private readonly stats: TransportStats = {
        sent: 0,
        droppedQueueFull: 0,
        sendFailed: 0,
        flushes: 0,
        skippedWhileBackingOff: 0,
    }

    constructor(options: TransportOptions = {}) {
        this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT
        this.send = options.send ?? browserSend
        this.debug = options.debug ?? false
    }

    /** 入队。逐条序列化：让不可序列化的输入在入队这刻就被丢掉，而不是攒到 unload 时炸 */
    enqueue(event: unknown): void {
        try {
            this.queue.push(JSON.stringify(event))
        } catch {
            // 循环引用等不可序列化的输入：宁可丢这一条，也不能让它掀翻业务代码
            return
        }
        this.trim()
    }

    /** 队列里还没发出去的事件数。单测与调试用 */
    get pending(): number {
        return this.queue.length
    }

    /** 这本账的快照。给调试与测试看，不进上报 */
    snapshot(): Readonly<TransportStats> {
        return { ...this.stats }
    }

    /** 超上限就从**队首**丢（最旧的先走）。入队与「失败放回」两条路都要过这里 */
    private trim(): void {
        while (this.queue.length > MAX_QUEUE) {
            this.queue.shift()
            this.stats.droppedQueueFull++
        }
    }

    /** 立即发送队列里的全部事件。只在收到 flush 信号时调，不做「每条一次请求」那种无收益的节流 */
    flush(): void {
        if (this.queue.length === 0) return
        if (Date.now() < this.backoffUntil) {
            // 刚失败过。接着撞只是把同一个失败重复一遍，还把心跳变成重试风暴
            this.stats.skippedWhileBackingOff++
            return
        }
        // 分批取：一次全发会让 body 撞上 beacon 配额，撞上了 sendBeacon 返回 false 但整批都已尝试
        const batch = this.queue.splice(0, MAX_BATCH)
        this.stats.flushes++
        if (this.debug) console.debug("[monitoring] flush", batch.length, "events")
        if (this.send(this.endpoint, `[${batch.join(",")}]`)) {
            this.stats.sent += batch.length
            this.consecutiveFailures = 0
            this.backoffUntil = 0
            return
        }
        // 交不出去就把它们放回队首：队列是本次会话最后的机会，丢了就真丢了
        this.queue.unshift(...batch)
        this.stats.sendFailed += batch.length
        this.consecutiveFailures++
        this.backoffUntil =
            Date.now() +
            Math.min(BACKOFF_BASE_MS * 2 ** (this.consecutiveFailures - 1), BACKOFF_MAX_MS)
        // 放回之后可能已经越界（大批失败 + 一直在 enqueue），再收一次
        this.trim()
    }

    /** 挂「转后台就 flush」与「空闲时 flush」，返回卸载函数。已挂过就返回空卸载，不重复挂也不误卸别人的 */
    bindLifecycle(): () => void {
        if (this.listenerBound || typeof document === "undefined") return () => {}
        this.listenerBound = true
        const onVisibilityChange = () => {
            if (document.visibilityState === "hidden") this.flush()
        }
        const onPageHide = () => this.flush()
        document.addEventListener("visibilitychange", onVisibilityChange)
        // pagehide 比 unload 可靠：bfcache 命中时 unload 不触发、pagehide 触发
        if (typeof window !== "undefined") window.addEventListener("pagehide", onPageHide)
        const idle = scheduleIdleFlush(() => this.flush())
        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange)
            if (typeof window !== "undefined") window.removeEventListener("pagehide", onPageHide)
            idle.cancel()
            // 复位闩：卸载后再装配要能重新挂上
            this.listenerBound = false
        }
    }

    /** 低频心跳 flush，把「偶发一次攒不出批次」的事件送出去。返回卸载函数——心跳每次装配一个 interval，不卸载就是纯泄漏 */
    startHeartbeat(intervalMs = 30_000): () => void {
        if (typeof setInterval === "undefined") return () => {}
        const id = setInterval(() => this.flush(), intervalMs)
        return () => clearInterval(id)
    }
}
