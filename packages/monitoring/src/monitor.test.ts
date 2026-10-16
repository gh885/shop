import { describe, expect, it, vi } from "vite-plus/test"

import { createMonitor } from "./monitor"
import { track } from "./state"

/** 单独钉：prod 漏注入 VITE_APP_VERSION 没有任何别的症状，守卫不响就没人发现坏了；反向——version 正常时不许出声（误报会训练人忽略它） */

function stderrOf(run: () => void): string[] {
    const messages: string[] = []
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
        messages.push(args.map(String).join(" "))
    })
    try {
        run()
    } finally {
        spy.mockRestore()
    }
    return messages
}

describe("createMonitor 的信封守卫", () => {
    it("prod 环境但 version 缺省即叫：构建期没注入 VITE_APP_VERSION 的症状是「完全不报错」", () => {
        const messages = stderrOf(() => {
            createMonitor({ app: "web", env: "prod", enabled: false })
        })
        expect(messages.join("\n")).toContain("VITE_APP_VERSION")
    })

    it("prod 下 version 仍是字面量 dev 也照样叫：它不可能是真实的构建标识", () => {
        const messages = stderrOf(() => {
            createMonitor({ app: "web", env: "prod", version: "dev", enabled: false })
        })
        expect(messages).toHaveLength(1)
    })

    it("version 是真实构建标识时不出声", () => {
        const messages = stderrOf(() => {
            createMonitor({ app: "web", env: "prod", version: "a1b2c3d", enabled: false })
        })
        expect(messages).toEqual([])
    })

    it("非生产环境不出声：dev 下没有构建标识本来就是常态", () => {
        const messages = stderrOf(() => {
            createMonitor({ app: "web", env: "dev", enabled: false })
        })
        expect(messages).toEqual([])
    })

    it("stats() 给出发送账本：计数写了没人读等于没写，这是它的读口", () => {
        const monitor = createMonitor({ app: "web", enabled: false })
        expect(monitor.stats()).toEqual({
            sent: 0,
            droppedQueueFull: 0,
            sendFailed: 0,
            flushes: 0,
            skippedWhileBackingOff: 0,
        })
    })

    it("stats() 反映真实发送结果：注入的 send 交不出去时计入 sendFailed", () => {
        const monitor = createMonitor({ app: "web", send: () => false })
        track({ kind: "route", to: "/" })
        monitor.flush()
        expect(monitor.stats().sendFailed).toBe(1)
        expect(monitor.stats().sent).toBe(0)
    })

    it("只喊不抛：装配失败绝不能拦住应用启动", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})
        try {
            expect(() => createMonitor({ app: "web", env: "prod", enabled: false })).not.toThrow()
        } finally {
            spy.mockRestore()
        }
    })
})
