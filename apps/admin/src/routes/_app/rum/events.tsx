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
import { rumEventListOptions, rumEventSearchSchema } from "#/rum/queries"
import { PagedListShell } from "#/shared/ui/paged-list-shell"

export const Route = createFileRoute("/_app/rum/events")({
    validateSearch: rumEventSearchSchema,
    component: RumEventsRoute,
})

/**
 * 某个问题下的上报明细：同一个指纹发生过哪些次。
 *
 * **抽屉状态住在这个页面**，不住在表格里：列定义是纯展示（拿一个「点了谁」的回调），
 * 表格本身不知道抽屉这回事，所以换一页、重排、换筛选都不会把一个开着的抽屉留在半空中。
 *
 * 这一页的筛选与分页全在 URL 上，所以一次排查（哪个问题、哪段时间、哪一次）是**可以贴给同事的链接**——
 * 这正是把「问题列表 → 明细」拆成两级路由而不是一层抽屉套抽屉的理由。
 */
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
