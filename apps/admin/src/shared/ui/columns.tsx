import type { ReactNode } from "react"
import type { ColumnDef, RowData } from "@tanstack/react-table"
import type { DataTableFeatures } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

function ActionsHeader() {
    const t = useT()
    return t("common.col.actions")
}

/** 操作列：右对齐、不参与列显隐 */
export function actionsColumn<T extends RowData>(
    render: (row: T) => ReactNode,
): ColumnDef<DataTableFeatures, T> {
    return {
        id: "actions",
        header: () => <ActionsHeader />,
        enableHiding: false,
        meta: { className: "text-right" },
        cell: ({ row }) => <>{render(row.original)}</>,
    }
}
