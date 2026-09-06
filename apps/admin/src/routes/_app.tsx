import { createFileRoute } from "@tanstack/react-router"

import { AdminLayout } from "../layout/admin-layout"
import { requireAuth } from "../shared/lib/api"

export const Route = createFileRoute("/_app")({
    beforeLoad: requireAuth,
    component: AdminLayout,
})
