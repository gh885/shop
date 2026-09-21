import { createRootRoute, Outlet } from "@tanstack/react-router"

import { ConfirmDialogHost, Toaster } from "@shop/ui-web"

export const Route = createRootRoute({
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
