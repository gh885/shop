import { createFileRoute } from "@tanstack/react-router"
import { Skeleton } from "@shop/ui-web"

import { ShippingTemplatePage } from "#/domains/shipping"

export const Route = createFileRoute("/_authenticated/trade/shipping")({
    component: ShippingTemplatePage,
    pendingComponent: ShippingTemplatePending,
})

function ShippingTemplatePending() {
    return (
        <div className="mx-auto w-full max-w-narrow space-y-4">
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-44 w-full rounded-lg" />
            <Skeleton className="h-44 w-full rounded-lg" />
        </div>
    )
}
