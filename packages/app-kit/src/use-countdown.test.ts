import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

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
})
