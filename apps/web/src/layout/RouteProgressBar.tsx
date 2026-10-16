import { useEffect, useState } from "react"
import { useRouterState } from "@tanstack/react-router"

import { cn } from "@shop/ui-web"

export function RouteProgressBar() {
    const loading = useRouterState({
        select: (s) => s.isLoading,
    })
    const [visible, setVisible] = useState(false)

    if (loading && !visible) {
        setVisible(true)
    }

    useEffect(() => {
        if (loading) return
        const timer = setTimeout(() => setVisible(false), 250)
        return () => clearTimeout(timer)
    }, [loading])

    return (
        <div
            aria-hidden="true"
            className={cn(
                "pointer-events-none fixed inset-x-0 top-0 z-overlay h-0.5 overflow-hidden transition-opacity duration-300",
                visible ? "opacity-100" : "opacity-0",
            )}
        >
            <div className="h-full w-full bg-primary motion-safe:animate-route-progress" />
        </div>
    )
}
