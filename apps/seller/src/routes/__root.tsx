import { AccountLocaleSync } from "#/app/locale-preference"
import { Link, Outlet, createRootRoute } from "@tanstack/react-router"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { FileQuestion } from "lucide-react"

import { Button, ConfirmDialogHost, Toaster } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

/**
 * 统一 devtools 面板（Router + Query），只在开发期可见——生产构建由 `@tanstack/devtools-vite` 的
 * remove-devtools-on-build 子插件整段剥离，所以这里无条件挂载。
 *
 * 挂在根路由内（而非 RouterProvider 之外）就够了：`TanStackRouterDevtoolsPanel` 自己不接 `router`
 * prop 时会用 `useRouter()` 从 context 取实例。
 */
const devtoolsConfig = { position: "bottom-right" as const }
const devtoolsPlugins = [
    {
        name: "Tanstack Router",
        render: <TanStackRouterDevtoolsPanel />,
    },
    {
        name: "Tanstack Query",
        render: <ReactQueryDevtoolsPanel />,
    },
]

/** 全局兜底：404（未匹配路径）。
    错误态由 `createRouter({ defaultErrorComponent })` 在每个 route match 上接管，
    叶子路由失败时布局壳仍保留。 */
export const Route = createRootRoute({
    notFoundComponent: NotFound,
    component: RootComponent,
})

/** 壳：文档标题走 catalog（原先是 index.html 里一句写死的中文），React 19 把它提到 head */
function RootComponent() {
    const t = useT()
    return (
        <AccountLocaleSync>
            <title>{t("app.title")}</title>
            <Toaster />
            <ConfirmDialogHost />
            <Outlet />
            <TanStackDevtools
                config={devtoolsConfig}
                plugins={devtoolsPlugins}
            />
        </AccountLocaleSync>
    )
}

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
