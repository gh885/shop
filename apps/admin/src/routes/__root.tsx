import { AccountLocaleSync } from "#/app/locale-preference"
import { createRootRoute, Link, Outlet } from "@tanstack/react-router"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"

import { buttonVariants, ConfirmDialogHost, Toaster } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

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
        <AccountLocaleSync>
            {/* 标题走 catalog：<title> 由 React19 提到 head，别再往 index.html 叠静态 title */}
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
