import { useEffect, useState } from "react"

/** 距目标时刻的剩余毫秒数；已过期/非法返回 0（倒计时归零兜底，不显示负数） */
function remainingMs(targetIso: string): number {
    const target = new Date(targetIso).getTime()
    if (Number.isNaN(target)) return 0
    return Math.max(0, target - Date.now())
}

/** 秒级倒计时：返回距 targetIso 的剩余秒数；每秒刷新，归零后停在 0。targetIso 空则返回 { seconds: 0, expired: true } */
export function useCountdown(targetIso: string): { seconds: number; expired: boolean } {
    const [seconds, setSeconds] = useState(() => Math.ceil(remainingMs(targetIso) / 1000))

    // targetIso 变化时在渲染期调整状态（React 文档推荐的 props→state 模式，避免 effect 内同步 setState）
    const [prevTarget, setPrevTarget] = useState(targetIso)
    if (prevTarget !== targetIso) {
        setPrevTarget(targetIso)
        setSeconds(targetIso ? Math.ceil(remainingMs(targetIso) / 1000) : 0)
    }

    useEffect(() => {
        if (!targetIso) return
        const timer = setInterval(() => {
            const s = Math.ceil(remainingMs(targetIso) / 1000)
            setSeconds(s)
            if (s <= 0) clearInterval(timer)
        }, 1000)
        return () => clearInterval(timer)
    }, [targetIso])

    return { seconds, expired: seconds <= 0 }
}

/** 秒 → 「HH:MM:SS」或「MM:SS」倒计时文案（不足 1h 省略小时） */
export function formatCountdown(totalSeconds: number): string {
    if (totalSeconds <= 0) return "00:00"
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = totalSeconds % 60
    const pad = (n: number) => String(n).padStart(2, "0")
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}
