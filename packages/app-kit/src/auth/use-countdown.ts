import { useCallback, useEffect, useState } from "react"

function normalizeSeconds(seconds: number): number {
    return Number.isFinite(seconds) ? Math.max(0, Math.trunc(seconds)) : 0
}

/**
 * 秒级倒计时（验证码重发等场景）：start(n) 开始 n 秒递减，减到 0 自动停止。
 * 返回 [剩余秒数, start]；重复 start 会以新值重置。
 *
 * 剩余秒数按「结束时刻 − Date.now()」重算，不在 tick 里 −1：后台标签页的 setInterval 会被节流到
 * 分钟级，逐格递减会让重发按钮比真实窗口多锁几十秒。与 `use-deadline` 同一时间基准。
 */
export function useCountdown(initial = 0): [number, (seconds: number) => void] {
    const [seconds, setSeconds] = useState(() => normalizeSeconds(initial))
    const [endsAt, setEndsAt] = useState<number | undefined>(() =>
        seconds > 0 ? Date.now() + seconds * 1000 : undefined,
    )
    // 只跟随「是否在跑」：依赖写成秒数会让 interval 每秒销毁重建
    const running = seconds > 0

    useEffect(() => {
        if (!running || endsAt === undefined) return
        const timer = setInterval(() => {
            const next = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
            setSeconds(next)
            if (next <= 0) clearInterval(timer)
        }, 1000)
        return () => clearInterval(timer)
    }, [running, endsAt])

    const start = useCallback((next: number) => {
        const normalized = normalizeSeconds(next)
        setSeconds(normalized)
        setEndsAt(normalized > 0 ? Date.now() + normalized * 1000 : undefined)
    }, [])

    return [seconds, start]
}
