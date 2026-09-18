import { Link, type ErrorComponentProps } from "@tanstack/react-router"

import { Button } from "@shop/ui-web"
import { RouteErrorFallback } from "@shop/app-kit"

/**
 * web 的路由级错误页：接入 `createRouter({ defaultErrorComponent })` 后，**每个 route match**
 * 失败都在自己的位置上渲染它 —— 叶子路由失败时导航壳（SiteHeader/Footer）仍在，不再是整页白屏。
 * 端级差异只有「回到首页」这个次要出口；重试的官方双 reset 接线在 `RouteErrorFallback` 里。
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
    return (
        <RouteErrorFallback
            error={error}
            reset={reset}
            secondaryAction={
                <Button
                    variant="outline"
                    render={<Link to="/" />}
                >
                    回到首页
                </Button>
            }
        />
    )
}
