import { createFileRoute } from "@tanstack/react-router"

import { SellerLayout } from "../components/seller-layout"
import { requireAuth } from "../lib/api"

export const Route = createFileRoute("/_app")({
    beforeLoad: requireAuth,
    component: SellerLayout,
})
