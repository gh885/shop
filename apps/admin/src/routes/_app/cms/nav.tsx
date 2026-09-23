import { z } from "zod"

import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { CMS_NAV_KEYS } from "#/cms/constants"
import { CmsListPage } from "#/cms/list-page"
import { NavFormDialog } from "#/cms/nav/form-dialog"
import { navListOptions } from "#/cms/nav/queries"
import { navColumns } from "#/cms/nav/table"

export const Route = createFileRoute("/_app/cms/nav")({
    validateSearch: z.object({
        navKey: z.string().trim().min(1).max(32).optional(),
    }),
    component: NavPage,
})

function NavPage() {
    const { navKey } = Route.useSearch()
    const navigate = Route.useNavigate()

    const { data: entries = [], isPending } = useQuery(navListOptions(navKey))

    return (
        <CmsListPage
            title="首页导航"
            description="买家端顶部导航与 mega 面板配置；分组/词条整段随条目保存，停用即隐藏、不做物理删除"
            columns={navColumns}
            rows={entries}
            isPending={isPending}
            emptyText="暂无符合条件的导航条目"
            createText="新增条目"
            filter={{
                label: "导航位",
                value: navKey,
                options: CMS_NAV_KEYS,
                onChange: (next) => void navigate({ search: { navKey: next } }),
            }}
            renderCreate={({ open, onOpenChange }) => (
                <NavFormDialog
                    open={open}
                    onOpenChange={onOpenChange}
                    defaultNavKey={navKey}
                />
            )}
        />
    )
}
