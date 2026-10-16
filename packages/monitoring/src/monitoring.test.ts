import { describe, expect, it, vi } from "vite-plus/test"

import { deviceInfo, fingerprint, toRouteTemplate } from "./envelope"
import { Transport } from "./transport"

describe("toRouteTemplate", () => {
    it("纯数字段换成 $id：实际 URL 进指标标签就是无界基数（每个商品一条路径）", () => {
        expect(toRouteTemplate("/products/12345")).toBe("/products/$id")
        expect(toRouteTemplate("/orders/20240001/items")).toBe("/orders/$id/items")
    })

    it("参数值命中 params 时按名字替换：/orders/$orderId 比 $id 更好读，接收端按它归组", () => {
        expect(toRouteTemplate("/orders/abc123", { orderId: "abc123" })).toBe("/orders/$orderId")
    })

    it("整段查表：参数值没命中就退到数字段规则，不会把 123 替成 $id 碎片", () => {
        expect(toRouteTemplate("/orders/123/items", { itemId: "77" })).toBe("/orders/$id/items")
    })

    it("非数字的非参数段原样保留：宁可模板化得不完美，也不把 slug 猜成参数", () => {
        expect(toRouteTemplate("/user/settings")).toBe("/user/settings")
        expect(toRouteTemplate("/category/phones")).toBe("/category/phones")
    })

    it("根路径与尾斜杠归一：/ 与 /a/ 都不该产生第二种模板形状", () => {
        expect(toRouteTemplate("/")).toBe("/")
        expect(toRouteTemplate("/cart/")).toBe("/cart")
    })
})

describe("fingerprint", () => {
    it("数字与 UUID 归一：同一个 bug 每次报的 id 不同，不抹就聚成一千条「新问题」", () => {
        const a = fingerprint("订单 12345 不存在", undefined)
        const b = fingerprint("订单 67890 不存在", undefined)
        expect(a).toBe(b)
    })

    it("只取栈顶三帧且去掉行号：行号每次构建都变，留在指纹里就没有任何两次能对上", () => {
        const stack = [
            "Error: boom",
            "    at handle (app.js:12:5)",
            "    at dispatch (app.js:40:9)",
            "    at run (app.js:99:1)",
            "    at deep (other.js:1:1)",
        ].join("\n")
        const fp = fingerprint("boom", stack)
        expect(fp).toContain("at handle|")
        expect(fp).not.toContain(":12:5")
        expect(fp).not.toContain("deep")
    })

    it("无栈时也能算（不崩、只靠 message 聚合）", () => {
        expect(fingerprint("boom", undefined)).toBe("boom::")
    })
})

describe("deviceInfo", () => {
    it("只解析浏览器与版本，不回传完整 UA 串（高基数，进明细打贵）", () => {
        const ua =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        const info = deviceInfo({ userAgent: ua, maxTouchPoints: 0 }, 1920, 1080)
        expect(info.browser).toBe("chrome 120")
        expect(info.deviceType).toBe("desktop")
        expect(info.screen).toBe("1920x1080")
    })

    it("Edge 的 UA 里含 Chrome：Edge 必须在 Chrome 之前匹配上，否则全被算成 chrome", () => {
        const edgeUa =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
        expect(deviceInfo({ userAgent: edgeUa, maxTouchPoints: 0 }, 1920, 1080).browser).toBe(
            "edge 120",
        )
    })

    it("触屏且短边小判移动端：买家端问题多半只在一类设备上出现", () => {
        expect(
            deviceInfo({ userAgent: "iPhone Safari 605", maxTouchPoints: 5 }, 390, 844).deviceType,
        ).toBe("mobile")
    })
})

describe("Transport", () => {
    it("flush 一次发一批：每条一次请求会把请求数放大到没有收益", () => {
        const sent: string[] = []
        const transport = new Transport({ send: (_endpoint, body) => (sent.push(body), true) })
        transport.enqueue({ kind: "route", to: "/a" })
        transport.enqueue({ kind: "route", to: "/b" })
        expect(transport.pending).toBe(2)
        transport.flush()
        expect(sent).toHaveLength(1)
        expect(JSON.parse(sent[0]!)).toHaveLength(2)
        expect(transport.pending).toBe(0)
    })

    it("交不出去就把批次放回队首：sendBeacon 配额满时返回 false 而不抛错，丢了就真丢了", () => {
        const transport = new Transport({ send: () => false })
        transport.enqueue({ kind: "route", to: "/a" })
        transport.flush()
        expect(transport.pending).toBe(1)
    })

    it("不可序列化的输入只丢那一条，不掀翻调用方", () => {
        const transport = new Transport({ send: () => true })
        const circular: Record<string, unknown> = {}
        circular.self = circular
        transport.enqueue(circular)
        transport.enqueue({ kind: "route", to: "/a" })
        transport.flush()
        expect(transport.pending).toBe(0)
    })

    it("队列封顶：接收端长期不可用时丢最旧的，而不是把业务页的内存吃光", () => {
        const transport = new Transport({ send: () => false })
        for (let i = 0; i < 600; i++) transport.enqueue({ kind: "route", to: `/${i}` })
        expect(transport.pending).toBe(500)
        expect(transport.snapshot().droppedQueueFull).toBe(100)
    })

    it("连续失败后退避：不去撞一个已知不通的接收端，也不把心跳变成重试风暴", () => {
        vi.useFakeTimers()
        try {
            const transport = new Transport({ send: () => false })
            transport.enqueue({ kind: "route", to: "/a" })
            transport.flush()
            transport.flush() // 退避窗口内 → 跳过
            expect(transport.snapshot().skippedWhileBackingOff).toBe(1)
            expect(transport.snapshot().flushes).toBe(1)

            vi.advanceTimersByTime(1_001)
            transport.flush()
            expect(transport.snapshot().flushes).toBe(2)
        } finally {
            vi.useRealTimers()
        }
    })

    it("一旦发出去就复位退避：走运一次不该还背着上次的惩罚", () => {
        vi.useFakeTimers()
        try {
            let online = false
            const transport = new Transport({ send: () => online })
            transport.enqueue({ kind: "route", to: "/a" })
            transport.flush()
            vi.advanceTimersByTime(1_001)
            online = true
            transport.flush()
            expect(transport.snapshot().sent).toBe(1)

            transport.enqueue({ kind: "route", to: "/b" })
            transport.flush() // 立刻可发，不该再被退避拦住
            expect(transport.snapshot().sent).toBe(2)
        } finally {
            vi.useRealTimers()
        }
    })
})
