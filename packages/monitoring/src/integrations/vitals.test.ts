import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { Metric } from "web-vitals"
import type { WebVitalName } from "../envelope"
import { Transport } from "../transport"

const observers = vi.hoisted(() => ({
    LCP: vi.fn<(callback: (metric: Metric) => void) => void>(),
    INP: vi.fn<(callback: (metric: Metric) => void) => void>(),
    CLS: vi.fn<(callback: (metric: Metric) => void) => void>(),
}))
vi.mock("web-vitals", () => ({ onLCP: observers.LCP, onINP: observers.INP, onCLS: observers.CLS }))

let documentState: EventTarget & { visibilityState: string }
let send: ReturnType<typeof vi.fn<(endpoint: string, body: string) => boolean>>

beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    vi.useFakeTimers()
    documentState = Object.assign(new EventTarget(), { visibilityState: "hidden" })
    vi.stubGlobal("document", documentState)
    vi.stubGlobal(
        "window",
        Object.assign(new EventTarget(), { matchMedia: () => ({ matches: true }) }),
    )
    const globalEvents = new EventTarget()
    vi.stubGlobal("addEventListener", globalEvents.addEventListener.bind(globalEvents))
    vi.stubGlobal("PerformanceObserver", vi.fn())
    vi.stubGlobal("screen", { width: 390, height: 844 })
    vi.stubGlobal("navigator", { userAgent: "Test", maxTouchPoints: 1 })
    send = vi.fn<(endpoint: string, body: string) => boolean>(() => true)
})

afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

/**
 * 只装 vitals 一个插件：本文件测的是指标采集，装上全局错误与白屏只会往队列里掺噪声。
 * 返回 `install` 供「重复装配只注册一次」用它再装一遍。
 */
async function start(options: { enabled?: boolean; sampleRate?: number } = {}) {
    const state = await import("../state")
    const { createMonitor } = await import("../monitor")
    const { webVitalsIntegration } = await import("./vitals")
    const install = () =>
        createMonitor({
            app: "web",
            transport: new Transport({ send }),
            integrations: (defaults) => defaults.filter((i) => i === webVitalsIntegration),
            ...options,
        })
    install()
    return { ...state, install }
}

async function emit(name: WebVitalName, value: number, id = "v5-test") {
    const callback = observers[name].mock.calls[0]?.[0]
    if (!callback) throw new Error("Missing Web Vitals callback")
    callback({
        name,
        value,
        id,
        delta: value,
        entries: [],
        rating: "good",
        navigationType: "navigate",
        navigationId: 0,
    })
    await Promise.resolve()
}

function events(): unknown[] {
    return send.mock.calls.flatMap(([, body]) => JSON.parse(body))
}

describe("Web Vitals adapter", () => {
    it("SSR 安全且允许客户端稍后装配", async () => {
        vi.stubGlobal("window", undefined)
        const { install } = await start()
        expect(observers.LCP).not.toHaveBeenCalled()
        vi.stubGlobal("window", new EventTarget())
        install()
        expect(observers.LCP).toHaveBeenCalledOnce()
    })

    it("可见时的临时零值不抢先入桶，转后台后读取更新的快照", async () => {
        documentState.visibilityState = "visible"
        await start()
        await emit("CLS", 0, "v6-restored")
        expect(send).not.toHaveBeenCalled()
        await emit("CLS", 0.2, "v6-restored")
        documentState.visibilityState = "hidden"
        documentState.dispatchEvent(new Event("visibilitychange"))
        await Promise.resolve()
        expect(events()).toEqual([expect.objectContaining({ value: 0.2 })])
    })

    it("重复装配只注册一次", async () => {
        const { install } = await start()
        install()
        for (const observer of Object.values(observers)) expect(observer).toHaveBeenCalledOnce()
    })

    it("只转发库的终值并保留零 CLS，不自行累加或估算 INP", async () => {
        const { flushMonitoring } = await start()
        await emit("CLS", 0)
        await emit("LCP", 1250.5)
        await emit("INP", 184)
        flushMonitoring()
        expect(events()).toEqual([
            expect.objectContaining({
                name: "CLS",
                value: 0,
                viewport: "small",
                metricId: "v5-test",
            }),
            expect.objectContaining({ name: "LCP", value: 1250.5 }),
            expect.objectContaining({ name: "INP", value: 184 }),
        ])
    })

    it("同一指标 id 的后续更新不重复计数，bfcache 新 id 可计数", async () => {
        const { flushMonitoring } = await start()
        await emit("INP", 180, "v5-first")
        await emit("INP", 400, "v5-first")
        await emit("INP", 100, "v5-bfcache")
        flushMonitoring()
        expect(events()).toHaveLength(2)
        expect(events()).toEqual([
            expect.objectContaining({ metricId: "v5-first", value: 180 }),
            expect.objectContaining({ metricId: "v5-bfcache", value: 100 }),
        ])
    })

    it("hidden 的 transport 监听先执行也不会把终值滞留到下一次心跳", async () => {
        await start()
        documentState.visibilityState = "hidden"
        documentState.dispatchEvent(new Event("visibilitychange"))
        expect(send).not.toHaveBeenCalled()
        await emit("CLS", 0.05)
        expect(send).toHaveBeenCalledOnce()
    })

    it.each([NaN, Infinity, -1])("非法数值 %s 不入队且不占用去重 id", async (value) => {
        const { flushMonitoring } = await start()
        await emit("CLS", value)
        await emit("CLS", 0.1)
        flushMonitoring()
        expect(events()).toHaveLength(1)
        expect(events()).toEqual([expect.objectContaining({ value: 0.1 })])
    })

    it.each([{ enabled: false }, { sampleRate: 0 }])(
        "遵守上报开关与会话采样 %j",
        async (options) => {
            const { flushMonitoring } = await start(options)
            await emit("LCP", 1000)
            flushMonitoring()
            expect(send).not.toHaveBeenCalled()
        },
    )

    it("缺少媒体查询 API 时标记 unknown，不猜测设备", async () => {
        vi.stubGlobal("window", new EventTarget())
        const { flushMonitoring } = await start()
        await emit("LCP", 1000)
        flushMonitoring()
        expect(events()).toEqual([expect.objectContaining({ viewport: "unknown" })])
    })

    it.each(["seller", "admin"] as const)("%s 装配复用同一份指标采集", async (app) => {
        const { createMonitor } = await import("../monitor")
        createMonitor({ app, transport: new Transport({ send }) })
        await emit("CLS", 0)
        expect(events()).toEqual([expect.objectContaining({ app, name: "CLS", value: 0 })])
    })

    it("宽屏标记 large", async () => {
        vi.stubGlobal(
            "window",
            Object.assign(new EventTarget(), { matchMedia: () => ({ matches: false }) }),
        )
        await start()
        await emit("LCP", 500)
        expect(events()).toEqual([expect.objectContaining({ viewport: "large" })])
    })

    it("发送失败不向页面抛异常", async () => {
        await start()
        send.mockImplementation(() => {
            throw new Error("offline")
        })
        await expect(emit("CLS", 0)).resolves.toBeUndefined()
    })

    it("单个指标注册失败不妨碍其余指标", async () => {
        observers.CLS.mockImplementation(() => {
            throw new Error("unsupported")
        })
        await expect(start()).resolves.toBeDefined()
        expect(observers.INP).toHaveBeenCalledOnce()
        expect(observers.LCP).toHaveBeenCalledOnce()
    })
})
