import { useMemo } from "react"
import type { RecommendTabResponse } from "@shop/api/sdk"

import type { ColumnDef } from "@tanstack/react-table"
import { Badge, type DataTableFeatures } from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { cmsStatusColumn, sortOrderColumn, targetColumn, targetTypeColumn } from "../list-columns"
import { actionsColumn } from "#/shared/ui/columns"
import { CmsRowActions } from "../row-actions"
import { useSetTabStatus } from "./queries"
import { TabFormDialog } from "./form-dialog"

function TabActions({ tab }: { tab: RecommendTabResponse }) {
    const t = useT()
    const setStatus = useSetTabStatus()

    return (
        <CmsRowActions
            row={tab}
            status={tab.status}
            label={tab.name}
            noun={t("cms.field.tabName")}
            hints={{
                disable: t("cms.tab.disableHint"),
                enable: t("cms.tab.enableHint"),
            }}
            pending={setStatus.isPending}
            submit={(status) => setStatus.mutateAsync({ id: tab.id, status })}
            Dialog={TabFormDialog}
        />
    )
}

export function useTabColumns(): ColumnDef<DataTableFeatures, RecommendTabResponse>[] {
    const t = useT()
    return useMemo(
        () => [
            {
                accessorKey: "name",
                header: t("cms.field.tabName"),
                cell: ({ row }) => (
                    <div className="flex items-center gap-2">
                        <span className="font-medium">{row.original.name}</span>
                        {row.original.isDefault && (
                            <Badge variant="warning">{t("cms.tab.defaultBadge")}</Badge>
                        )}
                    </div>
                ),
            },
            targetTypeColumn(t("cms.col.targetType")),
            targetColumn(t("cms.col.target")),
            sortOrderColumn(t("cms.col.sortOrder")),
            cmsStatusColumn(t("cms.col.status")),
            actionsColumn((tab) => <TabActions tab={tab} />),
        ],
        [t],
    )
}
