import { createFileRoute } from "@tanstack/react-router"
import { LogisticsIssuesPage } from "#/logistics/list-page"

export const Route = createFileRoute("/_app/logistics")({
    component: LogisticsRoute,
})

function LogisticsRoute() {
    return <LogisticsIssuesPage />
}
