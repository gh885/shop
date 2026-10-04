import { describe, expect, it, vi } from "vite-plus/test"
import { superviseTunnel } from "./tunnel-supervisor.mjs"

function fixture({ lifetimes = [], open = false, stopAfterWaits = Infinity } = {}) {
    const controller = new AbortController()
    const delays = []
    const events = []
    let now = 0
    let attempt = 0
    const runtime = {
        assertOwnership: vi.fn(async () => undefined),
        portsOpen: vi.fn(async () => open),
        now: () => now,
        wait: vi.fn(async (ms) => {
            delays.push(ms)
            now += ms
            if (delays.length >= stopAfterWaits) controller.abort()
        }),
        start: vi.fn(() => {
            const lifetime = lifetimes[attempt++] ?? 0
            return {
                exited: Promise.resolve().then(() => {
                    now += lifetime
                    return "ssh 退出"
                }),
                stop: vi.fn(),
            }
        }),
    }
    const run = (giveUpAfterFastFails = true) =>
        superviseTunnel({
            runtime,
            signal: controller.signal,
            giveUpAfterFastFails,
            onRetry: (event) => events.push(event),
        })
    return { controller, runtime, delays, events, run }
}

describe("隧道生命周期（不启动 SSH、不连接云数据面）", () => {
    it("端口属主不可信时拒绝，不能静默待命或启动隧道", async () => {
        const f = fixture({ open: true })
        f.runtime.assertOwnership.mockRejectedValue(new Error("端口不是 SSH"))
        await expect(f.run()).rejects.toThrow("端口不是 SSH")
        expect(f.runtime.portsOpen).not.toHaveBeenCalled()
        expect(f.runtime.start).not.toHaveBeenCalled()
    })

    it("重连前重新检查属主，被抢占后不再启动", async () => {
        const f = fixture()
        f.runtime.assertOwnership
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error("端口被抢占"))
        await expect(f.run()).rejects.toThrow("端口被抢占")
        expect(f.runtime.start).not.toHaveBeenCalled()
    })

    it("已有可用隧道只轮询，不另起进程", async () => {
        const f = fixture({ open: true, stopAfterWaits: 1 })
        await expect(f.run()).resolves.toEqual({ reason: "stopped" })
        expect(f.delays).toEqual([3000])
        expect(f.runtime.start).not.toHaveBeenCalled()
    })

    it("前台连续八次秒退才放弃，退避最多十五秒", async () => {
        const f = fixture()
        await expect(f.run()).resolves.toEqual({ reason: "failed", fastFails: 8 })
        expect(f.runtime.start).toHaveBeenCalledTimes(8)
        expect(f.delays).toEqual([500, 1000, 2000, 4000, 8000, 15000, 15000])
        expect(f.events.at(-1)).toMatchObject({ givingUp: true, fastFails: 8 })
    })

    it("后台超过八次仍重试，退避不再翻倍", async () => {
        const f = fixture({ stopAfterWaits: 10 })
        await expect(f.run(false)).resolves.toEqual({ reason: "stopped" })
        expect(f.runtime.start).toHaveBeenCalledTimes(10)
        expect(f.delays.slice(5)).toEqual([15000, 15000, 15000, 15000, 15000])
        expect(f.events.every((event) => !event.givingUp)).toBe(true)
    })

    it("稳定运行超过三十秒后，失败计数和退避一起复位", async () => {
        const f = fixture({ lifetimes: [0, 0, 30001], stopAfterWaits: 3 })
        await f.run()
        expect(f.delays).toEqual([500, 1000, 500])
        expect(f.events.map((event) => event.fastFails)).toEqual([1, 2, 0])
    })

    it("恰好三十秒仍属快速失败，不提前复位", async () => {
        const f = fixture({ lifetimes: [0, 30000], stopAfterWaits: 2 })
        await f.run()
        expect(f.delays).toEqual([500, 1000])
        expect(f.events.map((event) => event.fastFails)).toEqual([1, 2])
    })

    it("主动停止只清理持有的子进程，不继续重连", async () => {
        const f = fixture()
        let finish = vi.fn()
        const exited = new Promise((resolve) => {
            finish = () => resolve("被停止")
        })
        const stop = vi.fn(finish)
        f.runtime.start.mockReturnValue({ exited, stop })
        const running = f.run()
        await vi.waitFor(() => expect(f.runtime.start).toHaveBeenCalledTimes(1))
        f.controller.abort()
        await expect(running).resolves.toEqual({ reason: "stopped" })
        expect(stop).toHaveBeenCalledTimes(1)
        expect(f.runtime.start).toHaveBeenCalledTimes(1)
        expect(f.events).toEqual([])
    })

    it("探测还没返回就停止，迟到的探测结果不能再启动进程", async () => {
        const f = fixture()
        let finish = vi.fn()
        f.runtime.portsOpen.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = () => resolve(false)
                }),
        )
        const running = f.run()
        await vi.waitFor(() => expect(f.runtime.portsOpen).toHaveBeenCalledTimes(1))
        f.controller.abort()
        finish()
        await expect(running).resolves.toEqual({ reason: "stopped" })
        expect(f.runtime.start).not.toHaveBeenCalled()
    })

    it("可取消的等待抛 AbortError 时正常停止，不再启动", async () => {
        const f = fixture()
        f.runtime.wait.mockImplementation(async () => {
            f.controller.abort()
            throw new DOMException("已停止", "AbortError")
        })
        await expect(f.run()).resolves.toEqual({ reason: "stopped" })
        expect(f.runtime.start).toHaveBeenCalledTimes(1)
    })

    it("调用前已停止，连端口探针都不运行", async () => {
        const f = fixture()
        f.controller.abort()
        await expect(f.run()).resolves.toEqual({ reason: "stopped" })
        expect(f.runtime.assertOwnership).not.toHaveBeenCalled()
        expect(f.runtime.start).not.toHaveBeenCalled()
    })
})
