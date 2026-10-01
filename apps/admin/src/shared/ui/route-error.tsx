import type { ErrorComponentProps } from "@tanstack/react-router"

import { RouteErrorFallback } from "@shop/app-kit/shell" /**
 * admin 的路由级错误页：挂在 `createRouter({ defaultErrorComponent })` 上，
 * 每个 route match 失败都在自己的位置渲染（叶子失败时侧边栏仍在）。
 * 目前没有「次要出口」路由可回，所以只给重试；重试的官方双 reset 在 RouteErrorFallback 里。
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
    return (
        <RouteErrorFallback
            error={error}
            reset={reset}
        />
    )
}
