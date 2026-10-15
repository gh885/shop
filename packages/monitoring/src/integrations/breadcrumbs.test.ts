import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import type { Breadcrumb, MonitorErrorEvent, MonitoringEvent } from "../envelope"
import { createMonitor } from "../monitor"
import { captureError, flushMonitoring, track } from "../state"
import { Transport } from "../transport"
import type { MonitorContext } from "../types"
import { breadcrumbsIntegration } from "./breadcrumbs"

/**
 * 元素替身：只需要 `tagName` / `getAttribute` / `id`——插件**不该**碰 `textContent`，
 * 所以这里给它备一份文本，用来验它确实没被读走。
 *
 * 字段逐个声明而不是用构造函数参数属性：本仓开着 `erasableSyntaxOnly`，那个语法不允许。
 */
class FakeElement {
    readonly tagName: string
    readonly id: string
    readonly textContent: string
    private readonly attributes: Record<string, string>

    constructor(
        tagName: string,
        attributes: Record<string, string> = {},
        id = "",
        textContent = "",
    ) {
        this.tagName = tagName
        this.attributes = attributes
        this.id = id
        this.textContent = textContent
    }

    getAttribute(name: string): string | null {
        return this.attributes[name] ?? null
    }
}

describe("点击面包屑", () => {
    let added: Array<{ category: Breadcrumb["category"]; message: string }>
    let documentState: EventTarget

    beforeEach(() => {
        added = []
        documentState = new EventTarget()
        vi.stubGlobal("document", documentState)
        vi.stubGlobal("Element", FakeElement)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    function ctx(): MonitorContext {
        return {
            options: { app: "web" },
            transport: new Transport({ send: () => true }),
            captureError: () => {},
            track: () => {},
            addBreadcrumb: (category, message) => added.push({ category, message }),
            flush: () => {},
        }
    }

    /** 装上插件并取回卸载函数。顺手钉住「装得上就一定要返回卸载函数」 */
    function install(): () => void {
        const dispose = breadcrumbsIntegration.setup(ctx())
        if (typeof dispose !== "function") throw new Error("点击插件没有返回卸载函数")
        return dispose
    }

    /** 派发一次点击。`Event.target` 是只读访问器，用 own property 盖掉它 */
    function click(target: unknown): void {
        const event = new Event("click")
        Object.defineProperty(event, "target", { value: target })
        documentState.dispatchEvent(event)
    }

    it("点带 aria-label 的按钮：记出可读的名字，只留个标签名等于没记", () => {
        const dispose = install()
        click(new FakeElement("BUTTON", { "aria-label": "提交订单" }))
        expect(added).toEqual([{ category: "click", message: "button: 提交订单" }])
        dispose()
    })

    it("aria-label > title > id：取最有可读性的那个", () => {
        const dispose = install()
        click(new FakeElement("A", { "aria-label": "去购物车", title: "购物车" }, "nav-cart"))
        click(new FakeElement("SPAN", { title: "凑单" }, "addon"))
        click(new FakeElement("DIV", {}, "row-3"))
        expect(added.map((b) => b.message)).toEqual(["a: 去购物车", "span: 凑单", "div: row-3"])
        dispose()
    })

    it("没有可读标识时只留标签名：不回头去读渲染文本（契约 5 隐私边界）", () => {
        const dispose = install()
        click(new FakeElement("DIV", {}, "", "订单号 20240001 共 ¥128.00"))
        expect(added).toEqual([{ category: "click", message: "div" }])
        dispose()
    })

    it("卸载后不再记：捕获阶段的监听也摘得掉", () => {
        const dispose = install()
        dispose()
        click(new FakeElement("BUTTON", { "aria-label": "提交订单" }))
        expect(added).toEqual([])
    })

    it("点到没有元素的目标（document / 文本节点）时跳过，不记一条空面包屑", () => {
        const dispose = install()
        click(documentState)
        expect(added).toEqual([])
        dispose()
    })
})

describe("接口面包屑（在 track 出口记，与 route 那条同源）", () => {
    it("接口事件顺手留一条，出错时随信封一起报出去", () => {
        const sent: MonitoringEvent[] = []
        createMonitor({
            app: "web",
            transport: new Transport({
                send: (_endpoint, body) => {
                    for (const event of JSON.parse(body) as MonitoringEvent[]) sent.push(event)
                    return true
                },
            }),
            // 不装默认插件：本用例只验出口那一条，不要真的挂 window 监听
            integrations: () => [],
            enabled: true,
        })

        track({
            kind: "api",
            endpoint: "/api/orders/$id",
            method: "GET",
            status: 500,
            duration: 12,
        })
        captureError("custom", new Error("boom"))
        // 队列没到 20 条不会自动发，手动推出去
        flushMonitoring()

        const error = sent.find((event): event is MonitorErrorEvent => event.kind === "error")
        expect(error?.breadcrumbs).toEqual([
            { ts: expect.any(Number), category: "api", message: "GET /api/orders/$id 500" },
        ])
    })
})
