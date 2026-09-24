import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { formatCountdown, useDeadline } from "./use-deadline"

/**
 * 倒计时用 fake timers 驱动确定性信号（不 sleep 凑时间）：
 * 边界是归零停在 0、不显示负数、非法/空目标直接过期。
 */
beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-06T12:00:00Z"))
})
afterEach(() => {
    vi.useRealTimers()
})

describe("useDeadline", () => {
    it("未来时刻返回剩余秒数且未过期", () => {
        const { result } = renderHook(() => useDeadline("2026-09-06T12:00:30Z"))

        expect(result.current).toEqual({ seconds: 30, expired: false })
    })

    it("已过期时刻归零兜底为 0，不显示负数", () => {
        const { result } = renderHook(() => useDeadline("2026-09-06T11:00:00Z"))

        expect(result.current).toEqual({ seconds: 0, expired: true })
    })

    it("非法时刻串直接过期，不 NaN 扩散", () => {
        const { result } = renderHook(() => useDeadline("not-a-date"))

        expect(result.current).toEqual({ seconds: 0, expired: true })
    })

    it("空串视为无目标，直接过期", () => {
        const { result } = renderHook(() => useDeadline(""))

        expect(result.current).toEqual({ seconds: 0, expired: true })
    })

    it("每秒递减，归零后停在 0 不再继续走", () => {
        const { result } = renderHook(() => useDeadline("2026-09-06T12:00:02Z"))

        act(() => {
            vi.advanceTimersByTime(1000)
        })
        expect(result.current.seconds).toBe(1)

        act(() => {
            vi.advanceTimersByTime(2000)
        })
        expect(result.current).toEqual({ seconds: 0, expired: true })

        act(() => {
            vi.advanceTimersByTime(5000)
        })
        expect(result.current.seconds).toBe(0)
    })

    it("目标时刻变化时立即按新目标重算", () => {
        const { result, rerender } = renderHook(
            ({ target }: { target: string }) => useDeadline(target),
            { initialProps: { target: "2026-09-06T12:00:30Z" } },
        )

        rerender({ target: "2026-09-06T12:01:00Z" })

        expect(result.current.seconds).toBe(60)
    })
})

describe("formatCountdown", () => {
    it("不足 1 小时省略小时段", () => {
        expect(formatCountdown(0)).toBe("00:00")
        expect(formatCountdown(-5)).toBe("00:00")
        expect(formatCountdown(59)).toBe("00:59")
        expect(formatCountdown(60)).toBe("01:00")
        expect(formatCountdown(3661)).toBe("01:01:01")
    })
})
