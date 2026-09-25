import { useCallback, useEffect, useState } from "react"

/**
 * 秒级倒计时（验证码重发等场景）：start(n) 开始 n 秒递减，减到 0 自动停止。
 * 返回 [剩余秒数, start]；重复 start 会以新值重置。
 */
function normalizeSeconds(seconds: number): number {
    return Number.isFinite(seconds) ? Math.max(0, Math.trunc(seconds)) : 0
}

export function useCountdown(initial = 0): [number, (seconds: number) => void] {
    const [countdown, setCountdownState] = useState(() => normalizeSeconds(initial))
    // 只跟随「是否在跑」：依赖写成 countdown 会让 interval 每秒销毁重建
    const running = countdown > 0

    useEffect(() => {
        if (!running) return
        const timer = setInterval(() => setCountdownState((s) => (s > 1 ? s - 1 : 0)), 1000)
        return () => clearInterval(timer)
    }, [running])

    const start = useCallback((seconds: number) => {
        setCountdownState(normalizeSeconds(seconds))
    }, [])

    return [countdown, start]
}
