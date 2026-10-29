import { createFileRoute } from "@tanstack/react-router"

import { LogisticsPage } from "#/domains/logistics/logistics-page"

export const Route = createFileRoute("/_authenticated/logistics")({
    component: LogisticsRoute,
})

function LogisticsRoute() {
    return <LogisticsPage />
}
