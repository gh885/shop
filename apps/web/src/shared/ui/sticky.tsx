import { useEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "@shop/ui-web"

interface StickyProps {
    /** 吸顶时距离视口顶部的偏移（px）。第一层传 0，下层传顶栏累计高度。 */
    top?: number
    className?: string
    children: ReactNode
}

/**
 * 吸顶壳组件。
 *
 * 基于原生 position: sticky，滚动超过自身位置后固定在视口顶部（top 偏移处）。
 * 吸顶命中时通过 shadow + 背景给出视觉反馈，避免与下方内容黏连。
 * 所有层共享同一只读状态，不引入 JS 滚动重排。
 */
export function Sticky({ top = 0, className, children }: StickyProps) {
    const ref = useRef<HTMLDivElement>(null)
    const [stuck, setStuck] = useState(false)

    useEffect(() => {
        const el = ref.current
        if (!el) return

        // 根：元素顶边一旦越过 top 偏移线，即认为「吸住了」
        const observer = new IntersectionObserver(
            ([entry]) => setStuck(entry.intersectionRatio < 1),
            { rootMargin: `${-top}px 0px 0px 0px`, threshold: [1] },
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [top])

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
