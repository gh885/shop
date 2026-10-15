/**
 * 传输层：把事件送到接收端的那一段（frontend-monitoring.md「传输」条）。
 *
 * 四条硬要求，各自对应一个具体坑：
 * 1. `sendBeacon` / `fetch(keepalive)`，body 用 `text/plain`——用 `application/json` 会触发
 *    CORS 预检（OPTIONS），一个预检失败的静默请求比不监控更糟：它在控制台留红，还多一次往返。
 *    `text/plain` 属简单请求，不预检。
 * 2. `visibilitychange → hidden` 时 flush，**不依赖 `unload`**——移动端基本不触发 unload
 *    （用户直接切走、锁屏、来电），挂在 unload 上的 flush 等于没有。
 * 3. 出口自身全部 try/catch、空闲时处理。监控代码抛出的异常会连带弄坏业务页，
 *    那就本末倒置了（也让「出错」这件事更难查——现场正好被监控自己弄丢）。
 * 4. **线上格式是「事件对象的 JSON 数组」**，不是「JSON 字符串的数组」。队列里逐条存的是
 *    序列化后的字符串（好让不可序列化的输入在入队那一刻就被丢掉而不是在 unload 时炸），
 *    但拼包时用 `[a,b,c]` 而不是 `JSON.stringify([a,b,c])`——后者会把每个元素再转义一层，
 *    body 白白大一倍（引号全部 `\"`）。beacon 配额约 64KB，翻倍是真的会撞上。
 *
 * 发送端可换：这里只认 `MonitoringEvent[]`，不认识任何第三方 SDK。换后端改这一个文件。
 */

import type { SendFunction, TransportStats } from "./types"

/** 接收端路径：自己域名下的固定路径（契约第 3 条「上报发往自己域名下的固定路径」） */
export const DEFAULT_ENDPOINT = "/api/rum/events"

/** 单次批量的事件数上限：超了分批发。攒太多会让 beacon 的 body 超过浏览器配额（约 64KB）而被静默丢弃 */
const MAX_BATCH = 50

/**
 * 队列长度上限。**必须封顶**：接收端长期不可用（后端挂了、被墙、返回非 2xx）时队列只进不出，
 * 而它是纯内存常驻——用户把页签开着不动，事件却一条条涨，最后吃的是业务页的内存。
 * 到顶就丢**最旧的**（不是最新的）：新事件更可能对应「现在正在发生的问题」。
 */
const MAX_QUEUE = 500

/** 退避起点与上限：连续失败时 1s → 2s → 4s …… 封顶 60s */
const BACKOFF_BASE_MS = 1_000
const BACKOFF_MAX_MS = 60_000

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
    /** 最后一跳的发送实现。注入是为了测试与 SSR 场景（SSR 没有 fetch/sendBeacon），见 {@link SendFunction} */
    send?: SendFunction
    /** 调试开关：把发出去的东西打控制台。默认关——生产开着等于往用户控制台倒垃圾 */
    debug?: boolean
}

/**
 * 浏览器发送实现：优先 `sendBeacon`（页面卸载时唯一还能送达的方式），退到 `fetch(keepalive)`。
 *
 * 返回值表示「这次是否交出去了」，用于决定能不能把队列清空——`sendBeacon` 在配额满时返回
 * false 而不抛错，这时队列必须留着等下次，别把事件丢了。
 *
 * **已知盲区**：`fetch` 那一支是「已发出」，不是「送达」——它的结果在微任务之后才揭晓，
 * 而 flush 是同步的，队列此时已经清了。真实的网络失败（DNS 挂了、被拦截）在这里数不到，
 * 只能靠队列封顶与退避兜住最坏情况。要精确统计得把 flush 改成异步，而那不是这条链路
 * 值得付的复杂度（接收端本来就没有「重试」语义）。
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

/** 空闲 flush 的调度句柄。两种实现（idle / timeout）的取消方式不同，统一成一个形状 */
interface IdleHandle {
    cancel(): void
}

/**
 * 把一次 flush 排到浏览器空闲时。`requestIdleCallback` 没有就退 `setTimeout`——
 * 上报不该跟首屏抢主线程，首屏正是最不能被拖的时刻（对应「不拖垮页面」条）。
 */
function scheduleIdleFlush(run: () => void): IdleHandle {
    if (typeof requestIdleCallback === "function") {
        const id = requestIdleCallback(run)
        return { cancel: () => cancelIdleCallback(id) }
    }
    const id = setTimeout(run, 0)
    return { cancel: () => clearTimeout(id) }
}

/**
 * 传输器：队列 + 分批 + 退避 + 账本 + 生命周期钩子。**本包唯一的发送实现**，
 * 出口换掉的只是它内部那最后一跳（{@link SendFunction}）。
 *
 * 做成实例而不是模块级单例，是为了让三端各自的装配显式拿到一个对象（配置由各端传），
 * 也让单测能注入一个假发送实现而不碰真网络。
 *
 * `bindLifecycle` / `startHeartbeat` **返回卸载函数**：装配可以重来（web 的装配挂在
 * `useEffect` 里，dev 下 StrictMode 会跑两遍），没有卸载口就等于每装一次多一个监听、
 * 多一个 30s 定时器，且永远拆不掉。卸载后 `listenerBound` 复位，同一个实例能重新装上。
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

    /** 入队。序列化放在 flush 时做——JSON.stringify 有成本，页面正在 unload 时不该再浪费一次 CPU */
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

    /**
     * 立即发送队列里的全部事件。
     *
     * 有 flush 信号时才调；不需要节流到「每条一次请求」——那会成倍放大请求数，
     * 而收益为零（接收端本来就按批处理）。
     */
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

    /**
     * 挂上「页面转入后台就 flush」与「空闲时 flush」。返回卸载函数。
     *
     * 已经挂过就返回空卸载函数（不重复挂，也不误卸别人的）。
     */
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

    /**
     * 定时 flush：跨端都接一条低频心跳，把「偶发一次就再也攒不出批次」的事件送出去。
     * 返回卸载函数——心跳是每次装配一个 interval，不卸载就是纯泄漏。
     */
    startHeartbeat(intervalMs = 30_000): () => void {
        if (typeof setInterval === "undefined") return () => {}
        const id = setInterval(() => this.flush(), intervalMs)
        return () => clearInterval(id)
    }
}
