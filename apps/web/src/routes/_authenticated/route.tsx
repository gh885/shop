import { useEffect } from "react"
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router"

import { Skeleton } from "@shop/ui-web"

import { openLoginDialog, requireAuth, useAuthStatus } from "#/shared/api/auth"

export const Route = createFileRoute("/_authenticated")({
    beforeLoad: () => requireAuth(),
    component: ProtectedLayout,
})

function ProtectedLayout() {
    const status = useAuthStatus()
    const navigate = useNavigate()

    useEffect(() => {
        if (status === "guest") {
            openLoginDialog()
            void navigate({ to: "/" })
        }
    }, [status, navigate])

    if (status === "authed") return <Outlet />
    if (status === "guest") return undefined
    return <ProtectedSkeleton />
}

function ProtectedSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="mx-auto flex w-full max-w-page flex-col gap-4 px-6 py-8"
        >
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
        </div>
    )
}
