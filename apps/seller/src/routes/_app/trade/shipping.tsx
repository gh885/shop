import { createFileRoute } from "@tanstack/react-router"

import { ShippingTemplatePage } from "#/shipping"

export const Route = createFileRoute("/_app/trade/shipping")({
    component: ShippingTemplatePage,
})
