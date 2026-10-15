import { beforeEach, describe, expect, it } from "vite-plus/test"

import type { MonitorErrorEvent, MonitorFallbackEvent, MonitorPerformanceEvent } from "./envelope"
import { DEFAULT_PROCESSORS, applyProcessors, resetErrorLimits } from "./processors"

/**
 * 加工链的两条默认规则。钉的是**判据本身**，因为它错了不报错，只让数据悄悄变形：
 * - 限次写松 = 「一个 bug 报成一千条」；写紧 = 「持续报错只看得见 3 条」，看不见它还在持续
 * - 采样写错 = 分布被单会话扭曲，或整批性能数据消失
 */

/** 每次现造一份：信封是被加工器经手的数据，测试之间不能共享同一个对象 */
function baseEnvelope(sessionId: string, sampleRate: number) {
    return {
        schema: "shop.fe.v1" as const,
        app: "web" as const,
        version: "dev",
        env: "test",
        sessionId,
        route: "/",
        ts: 0,
        device: { browser: "chrome 120", deviceType: "desktop" as const, screen: "1920x1080" },
        sampleRate,
    }
}

function errorEvent(fingerprint: string, message = "boom"): MonitorErrorEvent {
    return {
        ...baseEnvelope("s-1", 1),
        kind: "error",
        name: "js_error",
        message,
        fingerprint,
        breadcrumbs: [],
    }
}

function perfEvent(sessionId: string, sampleRate: number): MonitorPerformanceEvent {
    return {
        ...baseEnvelope(sessionId, sampleRate),
        kind: "performance",
        name: "LCP",
        metricId: "m-1",
        viewport: "large",
        value: 1234,
    }
}

function fallbackEvent(): MonitorFallbackEvent {
    return { ...baseEnvelope("s-1", 1), kind: "fallback", source: "detail", status: 400 }
}

const run = (event: MonitorErrorEvent | MonitorPerformanceEvent | MonitorFallbackEvent) =>
    applyProcessors(DEFAULT_PROCESSORS, event)

beforeEach(() => {
    resetErrorLimits()
})

describe("errorLimitProcessor", () => {
    it("同一指纹第 4 条起丢弃：首次必报，之后两条用来发现「它还在持续」，再多只是刷屏", () => {
        const kept = [1, 2, 3, 4, 5].map(() => run(errorEvent("fp-a")))
        expect(kept.filter((e) => e !== undefined)).toHaveLength(3)
        expect(kept[3]).toBeUndefined()
        expect(kept[4]).toBeUndefined()
    })

    it("按指纹限次而不是按原文：订单号不同的两条是同一个 bug，按原文限等于没限", () => {
        expect(run(errorEvent("fp-same", "订单 12345 不存在"))).not.toBeNull()
        expect(run(errorEvent("fp-same", "订单 67890 不存在"))).not.toBeNull()
    })

    it("不同指纹各算各的：一个会话里两个 bug 都该报出来", () => {
        expect(run(errorEvent("fp-a"))).not.toBeNull()
        expect(run(errorEvent("fp-b"))).not.toBeNull()
        expect(run(errorEvent("fp-a"))).not.toBeNull()
    })

    it("非错误事件一律放行：限次只属于 error 这一类", () => {
        for (let i = 0; i < 10; i++) expect(run(fallbackEvent())).not.toBeNull()
    })
})

describe("samplingProcessor", () => {
    it("采样率 1 全放行、0 全丢：两个端点都不该有额外条件", () => {
        expect(run(perfEvent("s-1", 1))).not.toBeNull()
        expect(run(perfEvent("s-1", 0))).toBeUndefined()
    })

    it("按会话采样：同一 sessionId 要么全放要么全丢，否则分布被单会话扭曲", () => {
        const runs = Array.from({ length: 20 }, () => run(perfEvent("s-42", 0.5)) !== undefined)
        expect(new Set(runs).size).toBe(1)
    })

    it("0.5 确实在分流：不同会话既有放行也有丢弃（否则等于全开或全关，采样就是装饰）", () => {
        const kept = Array.from(
            { length: 200 },
            (_, i) => run(perfEvent(`s-${i}`, 0.5)) !== undefined,
        )
        expect(kept.some(Boolean)).toBe(true)
        expect(kept.some((delivered) => !delivered)).toBe(true)
    })

    it("采样率取自事件信封而不是当前配置：历史数据才能按当时的比例还原", () => {
        // 同一个 sessionId，信封里记的采样率不同 → 结果跟着信封走
        expect(run(perfEvent("s-7", 1))).not.toBeNull()
        expect(run(perfEvent("s-7", 0))).toBeUndefined()
    })

    it("非性能事件不受采样影响：错误与 PV 是分母，少一条分母就偏了", () => {
        expect(run(errorEvent("fp-x"))).not.toBeNull()
        expect(run(fallbackEvent())).not.toBeNull()
    })
})

describe("applyProcessors", () => {
    it("短路：前一环丢掉就不再往下跑", () => {
        const calls: string[] = []
        const result = applyProcessors(
            [
                {
                    name: "drop",
                    process() {
                        calls.push("drop")
                        return undefined
                    },
                },
                {
                    name: "never",
                    process(event) {
                        calls.push("never")
                        return event
                    },
                },
            ],
            errorEvent("fp-z"),
        )
        expect(result).toBeUndefined()
        expect(calls).toEqual(["drop"])
    })

    it("加工器抛错视同丢弃：不能让未经加工的原始事件溜出去", () => {
        const result = applyProcessors(
            [
                {
                    name: "boom",
                    process(): never {
                        throw new Error("加工器坏了")
                    },
                },
            ],
            errorEvent("fp-y"),
        )
        expect(result).toBeUndefined()
    })
})
