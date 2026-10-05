import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { TabFormDialog } from "#/cms/recommend-tab/form-dialog"
import { tabListOptions } from "#/cms/recommend-tab/queries"
import { useTabColumns } from "#/cms/recommend-tab/table"
import { CmsListShell } from "#/cms/list-shell"
import { useT } from "#/locales/use-t"

export const Route = createFileRoute("/_app/cms/recommend-tab")({
    component: RecommendTabPage,
})

function RecommendTabPage() {
    const t = useT()
    const { data: tabs = [], isPending } = useQuery(tabListOptions())
    const columns = useTabColumns()

    return (
        <CmsListShell
            title={t("admin.cms.tab.page.title")}
            description={t("admin.cms.tab.page.description")}
            columns={columns}
            rows={tabs}
            isPending={isPending}
            emptyContent={t("admin.cms.tab.page.empty")}
            createText={t("admin.cms.tab.create")}
            renderCreate={({ open, onOpenChange }) => (
                <TabFormDialog
                    open={open}
                    onOpenChange={onOpenChange}
                />
            )}
        />
    )
}
