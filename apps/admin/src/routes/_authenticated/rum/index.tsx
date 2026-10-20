import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useT } from "#/locales/use-t"
import { useRumIssueColumns } from "#/domains/rum/columns"
import { RumIssueFilters } from "#/domains/rum/filters"
import { rumIssueListOptions } from "#/domains/rum/queries"
import { rumIssueSearchSchema } from "#/domains/rum/search"
import { PagedListShell } from "#/shared/ui/paged-list-shell"

export const Route = createFileRoute("/_authenticated/rum/")({
    validateSearch: rumIssueSearchSchema,
    component: RumIssuesRoute,
})

// 不在前端重排/重分组：排序口径全在后端，重排会让「后端给的」和「人看到的」成两个答案
function RumIssuesRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    const t = useT()
    const columns = useRumIssueColumns()
    const query = useQuery(rumIssueListOptions(search))

    return (
        <PagedListShell
            title={t("rum.issues.title")}
            description={t("rum.issues.description")}
            search={search}
            navigate={navigate}
            query={query}
            columns={columns}
            emptyContent={t("rum.issues.empty")}
            draftKeys={["from", "to"]}
            filters={
                <RumIssueFilters
                    search={search}
                    navigate={navigate}
                />
            }
        />
    )
}
