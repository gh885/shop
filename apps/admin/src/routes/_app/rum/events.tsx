import { useState } from "react"
import type { AdminRumEventItem } from "@shop/api/sdk"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@shop/ui-web"
import { useT } from "#/locales/use-t"
import { RumEventDetailSheet } from "#/rum/detail-sheet"
import { useRumEventColumns } from "#/rum/event-columns"
import { RumEventFilters } from "#/rum/event-filters"
import { RUM_ISSUE_PAGE_SIZE } from "#/rum/constants"
import { rumEventListOptions } from "#/rum/queries"
import { rumEventSearchSchema } from "#/rum/search"
import { PagedListShell } from "#/shared/ui/paged-list-shell"

export const Route = createFileRoute("/_app/rum/events")({
    validateSearch: rumEventSearchSchema,
    component: RumEventsRoute,
})

function RumEventsRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    const t = useT()
    const [opened, setOpened] = useState<AdminRumEventItem | undefined>(undefined)
    const columns = useRumEventColumns(setOpened)
    const query = useQuery(rumEventListOptions(search))

    return (
        <>
            <PagedListShell
                title={t("rum.events.title")}
                description={t("rum.events.description")}
                search={search}
                navigate={navigate}
                query={query}
                columns={columns}
                emptyContent={t("rum.events.empty")}
                draftKeys={["fingerprint", "route", "from", "to"]}
                actions={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            navigate({ to: "/rum", search: { page: 1, size: RUM_ISSUE_PAGE_SIZE } })
                        }
                    >
                        {t("rum.events.back")}
                    </Button>
                }
                filters={
                    <RumEventFilters
                        search={search}
                        navigate={navigate}
                    />
                }
            />
            <RumEventDetailSheet
                event={opened}
                onClose={() => setOpened(undefined)}
            />
        </>
    )
}
