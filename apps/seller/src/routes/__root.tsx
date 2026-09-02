import { Link, Outlet, createRootRoute } from "@tanstack/react-router"
import { CircleAlert, FileQuestion } from "lucide-react"

import { Button } from "@shop/ui-web"

/** 全局兜底：404（未匹配路径）与硬错误（路由渲染崩溃）。
    独立于 _app 布局（带侧边栏/顶栏），因为 404/崩溃不是业务场景，不需要经营导航。 */
export const Route = createRootRoute({
    notFoundComponent: NotFound,
    errorComponent: RouteError,
    component: () => <Outlet />,
})

/** 品牌化 404：给出回工作台的出口，不做死胡同 */
function NotFound() {
    return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
                <FileQuestion className="size-8 text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
                <p className="text-sm font-medium text-muted-foreground">404</p>
                <h1 className="text-2xl font-bold tracking-tight">页面不存在或已下线</h1>
                <p className="text-sm text-muted-foreground">
                    你找的页面不在这里，回工作台继续吧。
                </p>
            </div>
            <Link
                to="/product/list"
                search={{ page: 1, size: 10 }}
            >
                <Button>回到工作台</Button>
            </Link>
        </div>
    )
}

/** 全局错误边界：路由渲染抛错时给友好错误页 + 重试，避免白屏 */
function RouteError({ error, reset }: { error: Error; reset: () => void }) {
    return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
                <CircleAlert className="size-8 text-destructive" />
            </div>
            <div className="space-y-1.5">
                <p className="text-sm font-medium text-destructive">出错了</p>
                <h1 className="text-2xl font-bold tracking-tight">页面暂时无法加载</h1>
                <p className="text-sm text-muted-foreground">
                    {error.message || "发生了意外错误，请重试。"}
                </p>
            </div>
            <div className="flex gap-2">
                <Button onClick={() => reset()}>重试</Button>
                <Button
                    variant="outline"
                    render={
                        <Link
                            to="/product/list"
                            search={{ page: 1, size: 10 }}
                        />
                    }
                >
                    回到工作台
                </Button>
            </div>
        </div>
    )
}
