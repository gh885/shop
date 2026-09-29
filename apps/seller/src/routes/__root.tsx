import { Link, Outlet, createRootRoute } from "@tanstack/react-router"
import { FileQuestion } from "lucide-react"

import { Button, ConfirmDialogHost, Toaster } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

/** 全局兜底：404（未匹配路径）。
    错误态由 `createRouter({ defaultErrorComponent })` 在每个 route match 上接管，
    叶子路由失败时布局壳仍保留。 */
export const Route = createRootRoute({
    notFoundComponent: NotFound,
    component: () => (
        <>
            <Toaster />
            <ConfirmDialogHost />
            <Outlet />
        </>
    ),
})

/** 品牌化 404：给出回工作台的出口，不做死胡同 */
function NotFound() {
    const t = useT()
    return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex size-16 items-center justify-center rounded-lg bg-muted">
                <FileQuestion className="size-8 text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
                <p className="text-sm font-medium text-muted-foreground">404</p>
                <h1 className="text-xl font-bold">{t("common.notFound.title")}</h1>
                <p className="text-sm text-muted-foreground">{t("common.notFound.description")}</p>
            </div>
            <Link
                to="/product/list"
                search={{ page: 1, size: 10 }}
            >
                <Button>{t("common.action.backHome")}</Button>
            </Link>
        </div>
    )
}
