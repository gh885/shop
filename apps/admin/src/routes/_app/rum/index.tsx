import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useT } from "#/locales/use-t"
import { useRumIssueColumns } from "#/rum/columns"
import { RumIssueFilters } from "#/rum/filters"
import { rumIssueListOptions, rumIssueSearchSchema } from "#/rum/queries"
import { PagedListShell } from "#/shared/ui/paged-list-shell"

export const Route = createFileRoute("/_app/rum/")({
    validateSearch: rumIssueSearchSchema,
    component: RumIssuesRoute,
})

/**
 * 遥测问题列表：有哪些问题，按**影响会话数**降序。
 *
 * 页面只管取数与 URL 状态——排序、分组、时间窗口径全在后端（`/admin/rum/issues`），
 * 前端不在这一层重排：重排会让「后端按什么给的」和「人看到什么」变成两个答案。
 *
 * 生产当前没有数据（遥测总开关默认关着），所以这页在线上多半是空的；空态文案因此写的是
 * 「这个时间窗里没有遥测上报」而不是「没有错误」——后者会让人以为系统很健康。
 */
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
