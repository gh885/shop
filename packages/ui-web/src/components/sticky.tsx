"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "src/lib/utils"

interface StickyProps {
    /** 吸顶时距离滚动容器顶部的偏移（px）。第一层传 0，下层传上层累计高度。 */
    top?: number
    /**
     * 判定「已吸住」的视口基准线（px），默认同 top。
     * 当滚动容器不是窗口（如工作台的 main 滚动区，上方还压着固定顶栏）时，
     * 元素吸住后的视口位置 ≠ top，需要显式给出这条线，否则永远判不出 stuck。
     */
    stuckAt?: number
    className?: string
    children: ReactNode
}

/**
 * 吸顶壳组件。
 *
 * 基于原生 position: sticky，滚动超过自身位置后固定在容器顶部（top 偏移处）。
 * 吸顶命中时通过 shadow + 背景给出视觉反馈，避免与下方内容黏连。
 * 所有层共享同一只读状态，不引入 JS 滚动重排。
 */
export function Sticky({ top = 0, stuckAt, className, children }: StickyProps) {
    const ref = useRef<HTMLDivElement>(null)
    const [stuck, setStuck] = useState(false)
    const line = stuckAt ?? top

    useEffect(() => {
        const el = ref.current
        if (!el) return

        // 根：元素顶边一旦越过基准线，即认为「吸住了」
        const observer = new IntersectionObserver(
            ([entry]) => setStuck(entry.intersectionRatio < 1),
            { rootMargin: `${-line}px 0px 0px 0px`, threshold: [1] },
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [line])

    return (
        <div
            ref={ref}
            className={cn("sticky z-30 transition-shadow duration-200", className)}
            style={{ top }}
            data-stuck={stuck || undefined}
        >
            <div
                className={cn(
                    "transition-[background-color,box-shadow] duration-200",
                    stuck && "bg-background/95 shadow-sm backdrop-blur",
                )}
            >
                {children}
            </div>
        </div>
    )
}
