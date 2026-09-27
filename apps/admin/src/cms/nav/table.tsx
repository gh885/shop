import type { NavEntryResponse } from "@shop/api/sdk"

import type { ColumnDef } from "@tanstack/react-table"
import { Badge, type DataTableFeatures } from "@shop/ui-web"

import { codeColumn, cmsStatusColumn, sortOrderColumn, targetTypeColumn } from "../list-columns"
import { subsSummary } from "../display"
import { actionsColumn } from "#/shared/ui/columns"
import { CmsRowActions } from "../row-actions"
import { useSetNavStatus } from "./queries"
import { NavFormDialog } from "./form-dialog"

function NavActions({ entry }: { entry: NavEntryResponse }) {
    const setStatus = useSetNavStatus()

    return (
        <CmsRowActions
            row={entry}
            status={entry.status}
            label={entry.title}
            hints={{
                disable: "停用后前台导航立即不再展示该条目，确认执行？",
                enable: "启用后前台导航展示该条目，确认执行？",
            }}
            pending={setStatus.isPending}
            submit={(status) => setStatus.mutateAsync({ id: entry.id, status })}
            Dialog={NavFormDialog}
        />
    )
}

export const navColumns: ColumnDef<DataTableFeatures, NavEntryResponse>[] = [
    codeColumn("navKey", "导航位", (entry) => entry.navKey),
    {
        accessorKey: "title",
        header: "标题",
        cell: ({ row }) => (
            <div className="flex items-center gap-2">
                <span className="font-medium">{row.original.title}</span>
                {row.original.iconKey && <Badge variant="outline">{row.original.iconKey}</Badge>}
            </div>
        ),
    },
    targetTypeColumn(),
    {
        id: "subs",
        header: "分组/词条",
        meta: { variant: "muted", className: "tabular-nums" },
        cell: ({ row }) => subsSummary(row.original.subs),
    },
    sortOrderColumn(),
    cmsStatusColumn(),
    actionsColumn((entry) => <NavActions entry={entry} />),
]
