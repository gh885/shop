import { createRootRoute, Link, Outlet } from "@tanstack/react-router"

import { useT } from "@shop/app-kit"
import { buttonVariants, ConfirmDialogHost, Toaster } from "@shop/ui-web"

export const Route = createRootRoute({
    notFoundComponent: NotFound,
    component: RootComponent,
})

function RootComponent() {
    return (
        <>
            <Toaster />
            <ConfirmDialogHost />
            <Outlet />
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
