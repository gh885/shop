import { StrictMode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useRowBusy } from "./use-row-busy"

/**
 * 行内动作的「正在处理哪一行」。
 *
 * 唯一要钉死的是复位：动作**失败**也必须把这一行放开。错误提示由全局 mutation 通道弹过了，
 * 这里若只在成功路径复位，那一行的按钮就永久禁着——用户看到的是「点了没反应也再点不动」。
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

        run("row-1")
        await waitFor(() => expect(result.current.busyId).toBe("row-1"))

        run("row-2")
        await waitFor(() => expect(result.current.busyId).toBe("row-2"))
    })

    it("动作成功：处理完就放开这一行", async () => {
        const { result } = renderHook(() => useRowBusy())
        const run = result.current.run(
            vi.fn<(id: string) => Promise<unknown>>(async () => undefined),
        )

        run("row-1")

        await waitFor(() => expect(result.current.busyId).toBeUndefined())
    })

    it("StrictMode 重挂载后仍能接收动作完成状态", async () => {
        const { result } = renderHook(() => useRowBusy(), { wrapper: StrictMode })
        const run = result.current.run(
            vi.fn<(id: string) => Promise<unknown>>(async () => undefined),
        )

        run("row-1")

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

        run("row-1")
        run("row-2")
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

        run("row-1")

        await waitFor(() => expect(result.current.busyId).toBeUndefined())
    })

    it("动作失败也复位：失败已经toast过了，不能顺手把行永久锁死", async () => {
        const { result } = renderHook(() => useRowBusy())
        const run = result.current.run(
            vi.fn<(id: string) => Promise<unknown>>(async () => {
                throw new Error("下架失败")
            }),
        )

        run("row-1")

        await waitFor(() => expect(result.current.busyId).toBeUndefined())
    })
})
