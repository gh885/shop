import { createRootRoute, Link, Outlet } from "@tanstack/react-router"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"

import { buttonVariants, ConfirmDialogHost, Toaster } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

/**
 * 统一 devtools 面板（Router + Query），只在开发期可见——生产构建由 `@tanstack/devtools-vite` 的
 * remove-devtools-on-build 子插件整段剥离，所以这里无条件挂载。
 *
 * 挂在根路由内（而非 RouterProvider 之外）就够了：根组件在 `mountSpa` 的 QueryClientProvider /
 * RouterProvider 之内，两个 panel 分别从各自 context 取实例（Router panel 不传 `router` 时用
 * `useRouter()` 兜底）。
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

export const Route = createRootRoute({
    notFoundComponent: NotFound,
    component: RootComponent,
})

function RootComponent() {
    const t = useT()
    return (
        <>
            {/* 文档标题走 catalog（原先是 index.html 里一句写死的中文）。React 19 会把它提到 head，
                所以这里不用再往 index.html 的静态 title 上叠一份。 */}
            <title>{t("app.title")}</title>
            <Toaster />
            <ConfirmDialogHost />
            <Outlet />
            <TanStackDevtools
                config={devtoolsConfig}
                plugins={devtoolsPlugins}
            />
        </>
    )
}

function NotFound() {
    const t = useT()
    return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-sm font-medium text-muted-foreground">404</p>
            <h1 className="text-xl font-bold">{t("common.notFound.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("common.notFound.description")}</p>
            <Link
                to="/"
                search={{ page: 1, size: 20 }}
                className={buttonVariants()}
            >
                {t("common.action.backHome")}
            </Link>
        </div>
    )
}
