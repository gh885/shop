import { createMonitor, flushMonitoring } from "@shop/monitoring"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { reportError } from "./report-error"

interface SentEvent {
    kind: string
    name?: string
}

const sent: SentEvent[] = []

const send = (_endpoint: string, body: string): boolean => {
    for (const event of JSON.parse(body) as SentEvent[]) sent.push(event)
    return true
}

function namesFor(error: unknown): string[] {
    sent.length = 0
    reportError(error)
    flushMonitoring()
    return sent.filter((e) => e.kind === "error").map((e) => e.name ?? "")
}

beforeEach(() => {
    sent.length = 0
    createMonitor({ app: "web", enabled: true, send, integrations: () => [] })
})

afterEach(() => {
    createMonitor({ app: "web", enabled: false, send, integrations: () => [] })
    vi.restoreAllMocks()
})

describe("reportError 的事件名", () => {
    it("Error 带 hydration 特征 → hydration_error", () => {
        expect(
            namesFor(new Error("Hydration failed because the initial UI does not match")),
        ).toEqual(["hydration_error"])
    })

    it("各版本文案都认：did not match / server html / text content does not match", () => {
        const names = [
            ...namesFor(new Error("Warning: Did not expect server html to contain ...")),
            ...namesFor(new Error("Text content does not match server-rendered HTML.")),
            ...namesFor(new Error("There was an error while hydrating. hydration mismatch")),
        ]
        expect(names).toEqual(["hydration_error", "hydration_error", "hydration_error"])
    })

    it("普通路由错误 → route_error，不被 hydration 判据误吞", () => {
        expect(namesFor(new Error("超时关单失败"))).toEqual(["route_error"])
    })

    it("非 Error 值走 JSON 序列化再判，而不是 String()", () => {
        expect(namesFor({ message: "React hydration error" })).toEqual(["hydration_error"])
        expect(namesFor("hydrat 失败")).toEqual(["hydration_error"])
        expect(namesFor({ detail: "库存不足" })).toEqual(["route_error"])
    })

    it("序列化不了的脏值（循环对象 / undefined）退化成 route_error，不抛", () => {
        const circular: Record<string, unknown> = { name: "loop" }
        circular["self"] = circular
        expect(namesFor(circular)).toEqual(["route_error"])
        expect(namesFor(undefined)).toEqual(["route_error"])
    })

    it("开发期连组件栈一起打 console.error（生产不取栈，见文件头）", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})
        reportError(new Error("boom"), { componentStack: "\n  at <Page>" })
        expect(spy).toHaveBeenCalledWith("[app-error]", expect.any(Error), {
            componentStack: "\n  at <Page>",
        })
    })
})
