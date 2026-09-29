/**
 * 传输层：把事件送到接收端的那一段（frontend-monitoring.md「传输」条）。
 *
 * 三条硬要求，各自对应一个具体坑：
 * 1. `sendBeacon` / `fetch(keepalive)`，body 用 `text/plain`——用 `application/json` 会触发
 *    CORS 预检（OPTIONS），一个预检失败的静默请求比不监控更糟：它在控制台留红，还多一次往返。
 *    `text/plain` 属简单请求，不预检。
 * 2. `visibilitychange → hidden` 时 flush，**不依赖 `unload`**——移动端基本不触发 unload
 *    （用户直接切走、锁屏、来电），挂在 unload 上的 flush 等于没有。
 * 3. 出口自身全部 try/catch、空闲时处理。监控代码抛出的异常会连带弄坏业务页，
 *    那就本末倒置了（也让「出错」这件事更难查——现场正好被监控自己弄丢）。
 *
 * 发送端可换：这里只认 `MonitoringEvent[]`，不认识任何第三方 SDK。换后端改这一个文件。
 */

/** 接收端路径：自己域名下的固定路径（契约第 3 条「上报发往自己域名下的固定路径」） */
export const DEFAULT_ENDPOINT = "/api/rum/events"

/** 单次批量的事件数上限：超了分批发。攒太多会让 beacon 的 body 超过浏览器配额（约 64KB）而被静默丢弃 */
const MAX_BATCH = 50

/**
 * 队列：内存里的待发事件。
 *
 * 为什么进内存而不是 localStorage：事件里带 route、错误栈，偶尔带 userId——
 * 写进 localStorage 就是**持久化个人数据**，且清不掉（用户清缓存前一直留着）。内存队列
 * 丢的只是「关页面时队列里那几条」，而 flush 已经覆盖了正常路径。
 */
export interface TransportOptions {
    /** 接收路径，默认 `/api/rum/events` */
    endpoint?: string
    /** 发送实现。注入是为了测试与 SSR 场景（SSR 没有 fetch/sendBeacon） */
    send?: (endpoint: string, body: string) => boolean
    /** 调试开关：把发出去的东西打控制台。默认关——生产开着等于往用户控制台倒垃圾 */
    debug?: boolean
}

/**
 * 浏览器发送实现：优先 `sendBeacon`（页面卸载时唯一还能送达的方式），退到 `fetch(keepalive)`。
 *
 * 返回值表示「这次是否交出去了」，用于决定能不能把队列清空——`sendBeacon` 在配额满时返回
 * false 而不抛错，这时队列必须留着等下次，别把事件丢了。
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
                // text/plain 避开 CORS 预检（同文件头的第 1 条）
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

/**
 * 传输器：队列 + flush + 生命周期钩子。
 *
 * 做成实例而不是模块级单例，是为了让三端各自的装配显式拿到一个对象（配置由各端传），
 * 也让单测能造一个假发送实现而不碰真网络。
 */
export class Transport {
    private readonly queue: string[] = []
    private readonly endpoint: string
    private readonly send: (endpoint: string, body: string) => boolean
    private readonly debug: boolean
    private listenerBound = false

    constructor(options: TransportOptions = {}) {
        this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT
        this.send = options.send ?? browserSend
        this.debug = options.debug ?? false
    }

    /** 入队。序列化放在 flush 时做——JSON.stringify 有成本，页面正在 unload 时不该再浪费一次 CPU */
    enqueue(event: unknown): void {
        try {
            this.queue.push(JSON.stringify(event))
        } catch {
            // 循环引用等不可序列化的输入：宁可丢这一条，也不能让它掀翻业务代码
        }
    }

    /** 队列里还没发出去的事件数。单测与调试用 */
    get pending(): number {
        return this.queue.length
    }

    /**
     * 立即发送队列里的全部事件。
     *
     * 有 flush 信号时才调；不需要节流到「每条一次请求」——那会成倍放大请求数，
     * 而收益为零（接收端本来就按批处理）。
     */
    flush(): void {
        if (this.queue.length === 0) return
        // 分批取：一次全发会让 body 撞上 beacon 配额，撞上了 sendBeacon 返回 false 但整批都已尝试
        const batch = this.queue.splice(0, MAX_BATCH)
        if (this.debug) console.debug("[monitoring] flush", batch.length, "events")
        // 交不出去就把它们放回队首：队列是本次会话最后的机会，丢了就真丢了
        if (!this.send(this.endpoint, JSON.stringify(batch))) this.queue.unshift(...batch)
    }

    /**
     * 挂上「页面转入后台就 flush」与「空闲时 flush」。
     *
     * 空闲调度用 `requestIdleCallback`（没有就退 `setTimeout`）：上报不该跟首屏抢主线程，
     * 首屏正是最不能被拖的时刻（对应「不拖垮页面」条）。
     */
    bindLifecycle(): void {
        if (this.listenerBound || typeof document === "undefined") return
        this.listenerBound = true
        const schedule = () => {
            if (typeof requestIdleCallback === "function") requestIdleCallback(() => this.flush())
            else setTimeout(() => this.flush(), 0)
        }
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") this.flush()
        })
        // pagehide 比 unload 可靠：bfcache 命中时 unload 不触发、pagehide 触发
        if (typeof window !== "undefined") window.addEventListener("pagehide", () => this.flush())
        schedule()
    }

    /** 定时 flush：跨端都接一条低频心跳，把「偶发一次就再也攒不出批次」的事件送出去 */
    startHeartbeat(intervalMs = 30_000): void {
        if (typeof setInterval === "undefined") return
        setInterval(() => this.flush(), intervalMs)
    }
}
