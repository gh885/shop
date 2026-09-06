import { useEffect, useState } from "react"
import { useRouterState } from "@tanstack/react-router"

/**
 * 全局路由切换进度条：路由加载/过渡时在顶部显示一条不确定态细条，
 * 让用户感知"页面在加载"，消除点击后无反馈的等待感。
 * 纯装饰，pointer-events-none，不干扰交互。
 */
export function RouteProgressBar() {
    // 用文档化的 isLoading（前台路由加载/切换）代替已移除的 isTransitioning
    const loading = useRouterState({
        select: (s) => s.isLoading,
    })
    const [visible, setVisible] = useState(false)

    // 加载开始：渲染期直接显示（props→state 调整模式，避免 effect 内同步 setState）
    if (loading && !visible) {
        setVisible(true)
    }

    useEffect(() => {
        if (loading) return
        // 加载完成后短暂停留再淡出，避免闪烁
        const timer = setTimeout(() => setVisible(false), 250)
        return () => clearTimeout(timer)
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
