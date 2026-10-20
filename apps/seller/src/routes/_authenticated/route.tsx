import { createFileRoute } from "@tanstack/react-router"

import { ShopGate } from "#/domains/shop"
import { requireAuth } from "#/shared/lib/api"
import { AppShell } from "#/layout/AppShell"

export const Route = createFileRoute("/_authenticated")({
    beforeLoad: requireAuth,
    component: () => (
        <ShopGate>
            <AppShell />
        </ShopGate>
    ),
})
