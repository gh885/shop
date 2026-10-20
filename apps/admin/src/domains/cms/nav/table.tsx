import { useMemo } from "react"
import type { NavEntryResponse } from "@shop/api/sdk"

import type { ColumnDef } from "@tanstack/react-table"
import { Badge, type DataTableFeatures } from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { codeColumn, cmsStatusColumn, sortOrderColumn, targetTypeColumn } from "../list-columns"
import { subsSummary } from "../display"
import { actionsColumn } from "#/shared/ui/columns"
import { CmsRowActions } from "../row-actions"
import { useSetNavStatus } from "./queries"
import { NavFormDialog } from "./form-dialog"

function NavActions({ entry }: { entry: NavEntryResponse }) {
    const t = useT()
    const setStatus = useSetNavStatus()

    return (
        <CmsRowActions
            row={entry}
            status={entry.status}
            label={entry.title}
            hints={{
                disable: t("cms.nav.disableHint"),
                enable: t("cms.nav.enableHint"),
            }}
            pending={setStatus.isPending}
            submit={(status) => setStatus.mutateAsync({ id: entry.id, status })}
            Dialog={NavFormDialog}
        />
    )
}

function SubsCell({ subs }: { subs: NavEntryResponse["subs"] }) {
    const t = useT()
    return subsSummary(subs, t)
}

export function useNavColumns(): ColumnDef<DataTableFeatures, NavEntryResponse>[] {
    const t = useT()
    return useMemo(
        () => [
            codeColumn("navKey", t("cms.field.navKey"), (entry) => entry.navKey),
            {
                accessorKey: "title",
                header: t("cms.field.title"),
                cell: ({ row }) => (
                    <div className="flex items-center gap-2">
                        <span className="font-medium">{row.original.title}</span>
                        {row.original.iconKey && (
                            <Badge variant="outline">{row.original.iconKey}</Badge>
                        )}
                    </div>
                ),
            },
            targetTypeColumn(t("cms.col.targetType")),
            {
                id: "subs",
                header: t("cms.nav.col.subs"),
                meta: { variant: "muted", className: "tabular-nums" },
                cell: ({ row }) => <SubsCell subs={row.original.subs} />,
            },
            sortOrderColumn(t("cms.col.sortOrder")),
            cmsStatusColumn(t("cms.col.status")),
            actionsColumn((entry) => <NavActions entry={entry} />),
        ],
        [t],
    )
}
