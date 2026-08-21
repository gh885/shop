import { useEffect, useState } from "react"
import { useRouterState } from "@tanstack/react-router"

/**
 * 全局路由切换进度条：路由加载/过渡时在顶部显示一条不确定态细条，
 * 让用户感知"页面在加载"，消除点击后无反馈的等待感。
 * 纯装饰，pointer-events-none，不干扰交互。
 */
export function RouteProgressBar() {
    const loading = useRouterState({
        select: (s) => s.isLoading || s.isTransitioning,
    })
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        if (loading) {
            setVisible(true)
        } else {
            // 加载完成后短暂停留再淡出，避免闪烁
            const timer = setTimeout(() => setVisible(false), 250)
            return () => clearTimeout(timer)
        }
    }, [loading])

    return (
        <div
            aria-hidden="true"
            className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-300 ${
                visible ? "opacity-100" : "opacity-0"
            }`}
        >
            <div className="h-full w-full bg-primary animate-[route-progress_1.1s_ease-in-out_infinite]" />
        </div>
    )
}
