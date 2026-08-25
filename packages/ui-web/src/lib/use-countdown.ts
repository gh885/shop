import { useEffect, useState } from "react"

/**
 * 秒级倒计时（验证码重发等场景）：start(n) 开始 n 秒递减，减到 0 自动停止。
 * 返回 [剩余秒数, start]；重复 start 会以新值重置。
 */
export function useCountdown(initial = 0): [number, (seconds: number) => void] {
    const [countdown, setCountdown] = useState(initial)

    useEffect(() => {
        if (countdown <= 0) return
        const timer = setInterval(() => setCountdown((s) => s - 1), 1000)
        return () => clearInterval(timer)
    }, [countdown])

    return [countdown, setCountdown]
}
