import { Transport, configureMonitoring } from "@shop/common"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { reportError } from "./report-error"

/**
 * `reportError` 的两条分支（hydration_error / route_error）是**判据本体**的测试。
 *
 * 为什么值得单独钉：hydration 失败不产生 console.error，页看着正常、事件却不响应，
 * 全靠这段关键词判据把它从 route_error 里分出来。判据写错不报错，只表现为
 * 「线上 hydration 事件永远是 0」或「所有路由错误都被标成 hydration」——两种都静默。
 *
 * 断言从注入的假 Transport 里读，不 mock 业务模块（frontend.md：`vi.mock` 业务模块禁止）。
 */

interface SentEvent {
    kind: string
    name?: string
}

const sent: SentEvent[] = []

function fakeTransport(): Transport {
    return new Transport({
        send: (_endpoint, body) => {
            // body 是「已逐条序列化的事件数组」的再序列化，所以每个元素是 JSON 字符串
            for (const raw of JSON.parse(body) as string[]) sent.push(JSON.parse(raw))
            return true
        },
    })
}

const transport = fakeTransport()

/** 跑一次出口并只取回**这一次**的事件名（每次先清空队列，不然多次调用会累加） */
function namesFor(error: unknown): string[] {
    sent.length = 0
    reportError(error)
    transport.flush()
    return sent.filter((e) => e.kind === "error").map((e) => e.name ?? "")
}

beforeEach(() => {
    sent.length = 0
    configureMonitoring({ app: "web", enabled: true, transport })
})

afterEach(() => {
    // 单例状态：留着 enabled 会串到同 project 的其它用例
    configureMonitoring({ app: "web", enabled: false, transport })
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

    /** 非 Error 的那几支是判据的真正难点：直接 String(error) 会得到 "[object Object]"，永远匹配不上 */
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
