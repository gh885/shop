import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { useCountdown } from "./use-countdown"

describe("useCountdown", () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it("按秒递减并在归零后停止计时器", async () => {
        vi.useFakeTimers()
        const { result } = renderHook(() => useCountdown())

        act(() => result.current[1](2))
        expect(result.current[0]).toBe(2)

        await act(async () => {
            vi.advanceTimersByTime(1000)
        })
        expect(result.current[0]).toBe(1)
        await act(async () => {
            vi.advanceTimersByTime(1000)
        })
        expect(result.current[0]).toBe(0)
        expect(vi.getTimerCount()).toBe(0)
    })

    it("拒绝负数和小数秒数，避免界面进入不可解释的倒计时", () => {
        const { result } = renderHook(() => useCountdown())

        act(() => result.current[1](-3))
        expect(result.current[0]).toBe(0)

        act(() => result.current[1](2.8))
        expect(result.current[0]).toBe(2)
    })

    it("tick 被后台节流拖长时按真实时间收敛，不多锁重发按钮", async () => {
        vi.useFakeTimers()
        const { result } = renderHook(() => useCountdown())
        const startedAt = Date.now()
        act(() => result.current[1](5))

        // 时钟已走了 4s 而 interval 才响应第一次（真实浏览器后台的节流形态）：
        // 逐格 −1 会停在 4，按结束时刻重算应是剩 1s
        vi.setSystemTime(startedAt + 3000)
        await act(async () => {
            vi.advanceTimersByTime(1000)
        })

        expect(result.current[0]).toBe(1)
    })
})
