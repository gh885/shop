import type { RecommendTabResponse } from "@shop/api/sdk"

import type { ColumnDef } from "@tanstack/react-table"
import { Badge, type DataTableFeatures } from "@shop/ui-web"

import { cmsStatusColumn, sortOrderColumn, targetColumn, targetTypeColumn } from "../list-columns"
import { actionsColumn } from "#/shared/ui/columns"
import { CmsRowActions } from "../row-actions"
import { useSetTabStatus } from "./queries"
import { TabFormDialog } from "./form-dialog"

function TabActions({ tab }: { tab: RecommendTabResponse }) {
    const setStatus = useSetTabStatus()

    return (
        <CmsRowActions
            row={tab}
            status={tab.status}
            label={tab.name}
            noun="词条"
            hints={{
                disable: "停用后前台推荐条立即不再展示该词条，确认执行？",
                enable: "启用后前台推荐条展示该词条，确认执行？",
            }}
            pending={setStatus.isPending}
            submit={(status) => setStatus.mutateAsync({ id: tab.id, status })}
            Dialog={TabFormDialog}
        />
    )
}

export const tabColumns: ColumnDef<DataTableFeatures, RecommendTabResponse>[] = [
    {
        accessorKey: "name",
        header: "词条",
        cell: ({ row }) => (
            <div className="flex items-center gap-2">
                <span className="font-medium">{row.original.name}</span>
                {row.original.isDefault && <Badge variant="warning">猜你喜欢</Badge>}
            </div>
        ),
    },
    targetTypeColumn(),
    targetColumn(),
    sortOrderColumn(),
    cmsStatusColumn(),
    actionsColumn((tab) => <TabActions tab={tab} />),
]
