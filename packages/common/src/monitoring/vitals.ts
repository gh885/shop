/**
 * Web Vitals（仅 web 端首批功能那条）。用 `PerformanceObserver` 原生实现，不引依赖。
 *
 * 为什么不引 `web-vitals`：它做的事就是「注册四个 observer + 处理 hidden 时取最后一条」，
 * 而 perf/README 定的口径是「新增依赖只被一个脚本引用，将来换测量引擎改动收在一个文件」——
 * 这里同理，自己写 60 行换来零依赖，代价远小于多一个供应链条目。
 *
 * 三条为什么是这三个（p75 是接收端算的，这里只负责量准）：
 * - **LCP**（最大内容渲染）：买家端首屏，用户什么时候看到主要内容
 * - **CLS**（累积布局偏移）：加购物车按钮把内容顶下去这种「点了之后页面自己跳了」
 * - **INP**（交互到下一次绘制）：实验室量不到，只有真实交互才有——这正是 RUM 存在的理由
 *
 * 为什么要等页面 `hidden` 才报：LCP 与 INP 在页面活着期间还会更新，提前报出去的是中途值，
 * 同一个页面两条记录，接收端按 p75 聚合时会被当成两个页面。
 */

import { track } from "./core"

/**
 * 浏览器侧只有 LargestContentfulPaint（没有 …Entry），而 layout-shift / event 两种
 * entry 类型在 TS DOM lib 里根本不存在（PerformanceObserver 的 entryType 字符串能传，
 * 但取不到类型）。这里自己声明最小形状——只用 startTime / value / duration / hadRecentInput
 * 这几个真会读的字段，多声明一份也不能让「改了浏览器接口」变成编译错误。
 */
interface LcpEntry {
    startTime: number
}
interface LayoutShiftEntry {
    value: number
    hadRecentInput: boolean
}
interface EventTimingEntry {
    duration: number
}

/** CLS 是无量纲的累计偏移，按「累加」观察，浏览器每次给一个增量 */
const clsObserve = {
    type: "layout-shift",
    buffered: true,
} as PerformanceObserverInit

const lcpObserve = {
    type: "largest-contentful-paint",
    buffered: true,
} as PerformanceObserverInit

/** 交互事件：durationThreshold 104ms 是 web-vitals 的默认，太低的会量到一堆轻点噪声 */
const inpObserve = {
    type: "event",
    buffered: true,
    durationThreshold: 104,
} as PerformanceObserverInit & { durationThreshold: number }

let bound = false
/** CLS 累加值：布局偏移要一整页加起来才是 CLS，单条 entry 只是一次偏移 */
let clsValue = 0
/** INP 取「最长的一次交互」而不是平均：交互是尾延迟体验，一次卡 2 秒比十次各 200ms 更糟 */
let inpValue = 0
/** 缓存最后一条 LCP：LCP 在页面活着期间还会更新，hidden 时才取最后一条报 */
let lcpCache: LcpEntry | null = null

/**
 * 绑 Web Vitals。SSR 侧不绑（没有 PerformanceObserver），且 web 是三端里唯一调它的。
 *
 * 幂等：`bindGlobalListeners` 同样可能已把 PerformanceObserver 挂过一次，
 * 多次绑定会报出两倍的数据，指标曲线会被自己搞出「突然涨了」的假回归。
 */
export function bindWebVitals(): void {
    if (bound) return
    if (typeof PerformanceObserver === "undefined") return
    bound = true

    // LCP：浏览器在元素被绘制/尺寸变化时给一条新的候选，取最后一条（即真正 LCP）
    observe(lcpObserve, (entry) => {
        const last = takeLast<LcpEntry>(entry)
        if (!last) return
        // 先缓存，hidden 时才报
        lcpCache = last
    })
    // CLS：每次 entry 加到累加值上
    observe(clsObserve, (entry) => {
        for (const shift of takeAll<LayoutShiftEntry>(entry)) {
            // hadRecentInput 的偏移是用户自己点出来的，不算 CLS（点完按钮页面动一下是预期）
            if (!shift.hadRecentInput) clsValue += shift.value
        }
    })
    // INP：取交互耗时最长的一次
    observe(inpObserve, (entry) => {
        for (const event of takeAll<EventTimingEntry>(entry)) {
            if (event.duration > inpValue) inpValue = event.duration
        }
    })

    // 三个指标都在 hidden 时报一次
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "hidden") return
        if (lcpCache) {
            track({ kind: "performance", name: "LCP", value: lcpCache.startTime })
        }
        if (clsValue > 0) track({ kind: "performance", name: "CLS", value: clsValue })
        if (inpValue > 0) track({ kind: "performance", name: "INP", value: inpValue })
        // 报过就归零：bfcache 回来时（pagehide → pageshow）页面还能再交互一轮，
        // 那轮的指标应该单独算一份，而不是把上一轮的重复发出去
        lcpCache = null
        clsValue = 0
        inpValue = 0
    })
}

/** 统一入口：PerformanceObserver 在旧浏览器（以及部分无头环境）不存在，静默降级 */
function observe(
    init: PerformanceObserverInit,
    handle: (entry: PerformanceEntryList) => void,
): void {
    try {
        const observer = new PerformanceObserver((list) => handle(list.getEntries()))
        observer.observe(init)
    } catch {
        // 不支持的 entryType（无头浏览器常缺）直接跳过——Web Vitals 量不到不影响页面
    }
}

function takeAll<T>(list: PerformanceEntryList): readonly T[] {
    // PerformanceEntryList 到 T 的断言：我们只知道真值形状，不知道编译期 T 是什么，
    // 所以走 unknown 中转（直接断言 TS 会说「无重叠」）
    return Array.from(list) as unknown as readonly T[]
}

function takeLast<T>(list: PerformanceEntryList): T | null {
    const all = takeAll<T>(list)
    return all.length > 0 ? (all[all.length - 1] ?? null) : null
}
