import { z } from "zod"

import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { TabFormDialog } from "#/cms/recommend-tab/form-dialog"
import { tabListOptions } from "#/cms/recommend-tab/queries"
import { tabColumns } from "#/cms/recommend-tab/table"
import { CmsListPage } from "#/cms/list-page"

export const Route = createFileRoute("/_app/cms/recommend-tab")({
    validateSearch: z.object({}),
    component: RecommendTabPage,
})

function RecommendTabPage() {
    const { data: tabs = [], isPending } = useQuery(tabListOptions())

    return (
        <CmsListPage
            title="推荐条词条"
            description="首页猜你喜欢词条栏配置；词条顺序即前台展示顺序，默认词条全局唯一"
            columns={tabColumns}
            rows={tabs}
            isPending={isPending}
            emptyText="暂无推荐词条"
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
