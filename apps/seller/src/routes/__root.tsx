import { AccountLocaleSync } from "#/app/locale-preference"
import { Link, Outlet, createRootRoute } from "@tanstack/react-router"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { FileQuestion } from "lucide-react"

import { Button, ConfirmDialogHost, Toaster } from "@shop/ui-web"

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
