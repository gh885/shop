import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { TabFormDialog } from "#/cms/recommend-tab/form-dialog"
import { tabListOptions } from "#/cms/recommend-tab/queries"
import { tabColumns } from "#/cms/recommend-tab/table"
import { CmsListShell } from "#/cms/list-shell"

export const Route = createFileRoute("/_app/cms/recommend-tab")({
    component: RecommendTabPage,
})

function RecommendTabPage() {
    const { data: tabs = [], isPending } = useQuery(tabListOptions())

    return (
        <CmsListShell
            title="推荐条词条"
            description="首页猜你喜欢词条栏配置；词条顺序即前台展示顺序，默认词条全局唯一"
            columns={tabColumns}
            rows={tabs}
            isPending={isPending}
            emptyContent="还没有推荐词条，点「新增词条」建第一条"
            createText="新增词条"
            renderCreate={({ open, onOpenChange }) => (
                <TabFormDialog
                    open={open}
                    onOpenChange={onOpenChange}
                />
            )}
        />
    )
}
