import { StrictMode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vite-plus/test"

import { useRowBusy } from "./use-row-busy"

/**
 * 行内动作的「正在处理哪一行」。
 *
 * 唯一要钉死的是复位：动作**失败**也必须把这一行放开。错误提示由全局 mutation 通道弹过了，
 * 这里若只在成功路径复位，那一行的按钮就永久禁着——用户看到的是「点了没反应也再点不动」。
 *
 * 成功路径不单独立一条：并发那条已经验了「最新请求完成后正确复位」，再拆一条成功专用用例
 * 只是把同一个判据换个名字再跑一遍。
 */

function deferred() {
    let resolve!: (value: unknown) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<unknown>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

describe("useRowBusy", () => {
    it("同一时刻只标一行：后点的行接管，前一行的按钮不被连带禁着", async () => {
        const { promise } = deferred()
        const { result } = renderHook(() => useRowBusy())
        const run = result.current.run(vi.fn<(id: string) => Promise<unknown>>(() => promise))

        void run("row-1")
        await waitFor(() => expect(result.current.busyId).toBe("row-1"))

        void run("row-2")
        await waitFor(() => expect(result.current.busyId).toBe("row-2"))
    })
    it("StrictMode 重挂载后仍能接收动作完成状态", async () => {
        const { result } = renderHook(() => useRowBusy(), { wrapper: StrictMode })
        const run = result.current.run(
            vi.fn<(id: string) => Promise<unknown>>(async () => undefined),
        )

        void run("row-1")

        await waitFor(() => expect(result.current.busyId).toBeUndefined())
    })

    it("并发动作只有最后一次接管忙碌态：旧请求完成不能提前解锁新请求", async () => {
        const first = deferred()
        const second = deferred()
        const { result } = renderHook(() => useRowBusy())
        const run = result.current.run(
            vi.fn<(id: string) => Promise<unknown>>((id) =>
                id === "row-1" ? first.promise : second.promise,
            ),
        )

        void run("row-1")
        void run("row-2")
        await waitFor(() => expect(result.current.busyId).toBe("row-2"))

        await act(async () => {
            first.resolve(undefined)
            await first.promise
        })
        expect(result.current.busyId).toBe("row-2")

        await act(async () => {
            second.resolve(undefined)
            await second.promise
        })
        await waitFor(() => expect(result.current.busyId).toBeUndefined())
    })

    it("动作同步抛错也复位：异步链建立前的异常不能把行永久锁死", async () => {
        const { result } = renderHook(() => useRowBusy())
        const run = result.current.run(
            vi.fn<(id: string) => Promise<unknown>>(() => {
                throw new Error("下架失败")
            }),
        )

        void run("row-1")

        await waitFor(() => expect(result.current.busyId).toBeUndefined())
    })

    it("动作失败也复位：失败已经toast过了，不能顺手把行永久锁死", async () => {
        const { result } = renderHook(() => useRowBusy())
        const run = result.current.run(
            vi.fn<(id: string) => Promise<unknown>>(async () => {
                throw new Error("下架失败")
            }),
        )

        void run("row-1")

        await waitFor(() => expect(result.current.busyId).toBeUndefined())
    })

    it("返回的 promise 把失败原样透出，且复位照常（弹窗按结果决定失败不关窗）", async () => {
        const { result } = renderHook(() => useRowBusy())
        const failure = new Error("422")
        const run = result.current.run(
            vi.fn<(id: string) => Promise<unknown>>(() => Promise.reject(failure)),
        )

        const done = run("row-1")
        await expect(done).rejects.toBe(failure)
        await waitFor(() => expect(result.current.busyId).toBeUndefined())
    })

    it("发射即忘的调用点不接返回值也干净：透出的 rejection 有兜底分支接住", async () => {
        // 不监听 process：dom 项目里没有 node 类型，而 vitest 本身就会把 unhandledRejection
        // 报成整个文件失败——漏接一条就红，不需要再造一个监听器
        const { result } = renderHook(() => useRowBusy())
        const run = result.current.run(
            vi.fn<(id: string) => Promise<unknown>>(() => Promise.reject(new Error("422"))),
        )

        void run("row-1")
        await waitFor(() => expect(result.current.busyId).toBeUndefined())
        // 再放行一个宏任务：unhandledRejection 要等微任务队列清空后才判定
        await new Promise((res) => setTimeout(res, 0))
    })
})
