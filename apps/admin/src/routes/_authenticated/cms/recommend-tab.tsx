import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { TabFormDialog } from "#/domains/cms/recommend-tab/form-dialog"
import { tabListOptions } from "#/domains/cms/recommend-tab/queries"
import { useTabColumns } from "#/domains/cms/recommend-tab/table"
import { CmsListShell } from "#/domains/cms/list-shell"
import { useT } from "#/locales/use-t"

export const Route = createFileRoute("/_authenticated/cms/recommend-tab")({
    component: RecommendTabPage,
})

function RecommendTabPage() {
    const t = useT()
    const { data: tabs = [], isPending } = useQuery(tabListOptions())
    const columns = useTabColumns()

    return (
        <CmsListShell
            title={t("cms.tab.page.title")}
            description={t("cms.tab.page.description")}
            columns={columns}
            rows={tabs}
            isPending={isPending}
            emptyContent={t("cms.tab.page.empty")}
            createText={t("cms.tab.create")}
            renderCreate={({ open, onOpenChange }) => (
                <TabFormDialog
                    open={open}
                    onOpenChange={onOpenChange}
                />
            )}
        />
    )
}
