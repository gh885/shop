import { createFileRoute } from "@tanstack/react-router"

import { requireAuth } from "#/shared/lib/api"
import { AppShell } from "#/layout/AppShell"

export const Route = createFileRoute("/_app")({
    beforeLoad: requireAuth,
    component: AppShell,
})
