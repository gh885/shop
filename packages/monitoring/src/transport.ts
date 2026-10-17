// 传输层：把事件送到接收端。硬要求与论证见 frontend-monitoring.md「传输」条，这里只留代码看不出的坑（text/plain 避预检、pagehide 非 unload、拼包不双重转义——各在其用点）。

import type { SendFunction, TransportStats } from "./types"

export const DEFAULT_ENDPOINT = "/api/rum/events"

const MAX_BATCH = 50

/** 队列必须封顶：接收端长期不可用时纯内存常驻吃业务页内存。到顶丢最旧的——新事件更可能对应在发生的问题 */
const MAX_QUEUE = 500

const BACKOFF_BASE_MS = 1_000
const BACKOFF_MAX_MS = 60_000

/** 队列进内存而非 localStorage：事件带 route/错误栈/偶发 userId，写进 localStorage 就是持久化个人数据且清不掉 */
export interface TransportOptions {
    endpoint?: string
    send?: SendFunction
    debug?: boolean
}

/**
 * 优先 sendBeacon（页面卸载时唯一还能送达的方式），退 fetch(keepalive)。返回值=「这次交出去了没」，决定能否清队列；sendBeacon 配额满返回 false 不抛错，此时必须留着。fetch 支是「已发出」非「送达」，真网络失败靠队列封顶与退避兜底。
 */
function browserSend(endpoint: string, body: string): boolean {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        try {
            if (
                navigator.sendBeacon(
                    endpoint,
                    new Blob([body], { type: "text/plain;charset=UTF-8" }),
                )
            ) {
                return true
            }
        } catch {
            // 配额满、卸载中、或跨域被拦——都往下退到 fetch
        }
    }
    if (typeof fetch === "function") {
        try {
            void fetch(endpoint, {
                method: "POST",
                body,
                headers: { "Content-Type": "text/plain;charset=UTF-8" },
                keepalive: true,
                // 显式关掉：不让上报被业务 cookie 带上，也不触发任何拦截器
                credentials: "omit",
            }).catch(() => {})
            return true
        } catch {
            return false
        }
    }
    return false
}

interface IdleHandle {
    cancel(): void
}

/** 把 flush 排到浏览器空闲（没有 requestIdleCallback 退 setTimeout）：上报不跟首屏抢主线程 */
function scheduleIdleFlush(run: () => void): IdleHandle {
    if (typeof requestIdleCallback === "function") {
        const id = requestIdleCallback(run)
        return { cancel: () => cancelIdleCallback(id) }
    }
    const id = setTimeout(run, 0)
    return { cancel: () => clearTimeout(id) }
}

/** bindLifecycle/startHeartbeat 返回卸载函数：装配会重跑（dev StrictMode 跑两遍），不卸载就是每装一次多一个监听/定时器。做成实例让三端各自装配、单测能注入假发送 */
export class Transport {
    private readonly queue: string[] = []
    private readonly endpoint: string
    private readonly send: SendFunction
    private readonly debug: boolean
    private listenerBound = false
    private consecutiveFailures = 0
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

    /** 逐条序列化：让不可序列化输入在这刻就被丢掉，而非攒到 unload 时炸 */
    enqueue(event: unknown): void {
        try {
            this.queue.push(JSON.stringify(event))
        } catch {
            return
        }
        this.trim()
    }

    get pending(): number {
        return this.queue.length
    }

    /** 给调试与测试看，不进上报 */
    snapshot(): Readonly<TransportStats> {
        return { ...this.stats }
    }

    private trim(): void {
        while (this.queue.length > MAX_QUEUE) {
            this.queue.shift()
            this.stats.droppedQueueFull++
        }
    }

    flush(): void {
        if (this.queue.length === 0) return
        if (Date.now() < this.backoffUntil) {
            this.stats.skippedWhileBackingOff++
            return
        }
        // 分批取：一次全发会让 body 撞 beacon 配额，撞上了 sendBeacon 返回 false 但整批都已尝试
        const batch = this.queue.splice(0, MAX_BATCH)
        this.stats.flushes++
        if (this.debug) console.debug("[monitoring] flush", batch.length, "events")
        if (this.send(this.endpoint, `[${batch.join(",")}]`)) {
            this.stats.sent += batch.length
            this.consecutiveFailures = 0
            this.backoffUntil = 0
            return
        }
        // 交不出去放回队首：队列是本次会话最后的机会
        this.queue.unshift(...batch)
        this.stats.sendFailed += batch.length
        this.consecutiveFailures++
        this.backoffUntil =
            Date.now() +
            Math.min(BACKOFF_BASE_MS * 2 ** (this.consecutiveFailures - 1), BACKOFF_MAX_MS)
        // 放回后可能已越界（大批失败 + 一直在 enqueue），再收一次
        this.trim()
    }

    /** 挂「转后台就 flush」与「空闲时 flush」，返回卸载函数。已挂过返回空卸载，不重复挂也不误卸别人的 */
    bindLifecycle(): () => void {
        if (this.listenerBound || typeof document === "undefined") return () => {}
        this.listenerBound = true
        const onVisibilityChange = () => {
            if (document.visibilityState === "hidden") this.flush()
        }
        const onPageHide = () => this.flush()
        document.addEventListener("visibilitychange", onVisibilityChange)
        // pagehide 比 unload 可靠：bfcache 命中时 unload 不触发
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

    /** 低频心跳 flush，把偶发一次攒不出批次的事件送出去。返回卸载函数——不卸载就是纯泄漏 */
    startHeartbeat(intervalMs = 30_000): () => void {
        if (typeof setInterval === "undefined") return () => {}
        const id = setInterval(() => this.flush(), intervalMs)
        return () => clearInterval(id)
    }
}
