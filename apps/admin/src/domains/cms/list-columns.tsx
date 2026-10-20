import type { CmsStatus } from "@shop/api/sdk"
import type { ColumnDef, RowData } from "@tanstack/react-table"
import { Badge, type DataTableFeatures } from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { STATUS_BADGE } from "./constants"

function CmsStatusBadge({ status }: { status: CmsStatus }) {
    const t = useT()
    const badge = STATUS_BADGE[status]
    return <Badge variant={badge.variant}>{t(badge.labelKey)}</Badge>
}

export function cmsStatusColumn<T extends { status: CmsStatus }>(
    header: string,
): ColumnDef<DataTableFeatures, T> {
    return {
        id: "status",
        header,
        cell: ({ row }) => <CmsStatusBadge status={row.original.status} />,
    }
}

export function sortOrderColumn<T extends { sortOrder: number }>(
    header: string,
): ColumnDef<DataTableFeatures, T> {
    return {
        id: "sortOrder",
        header,
        meta: { className: "tabular-nums" },
        cell: ({ row }) => row.original.sortOrder,
    }
}

export function targetTypeColumn<T extends { targetType: string | null }>(
    header: string,
): ColumnDef<DataTableFeatures, T> {
    return {
        id: "targetType",
        header,
        cell: ({ row }) =>
            row.original.targetType ? (
                <Badge variant="info">{row.original.targetType}</Badge>
            ) : (
                <span className="text-muted-foreground">—</span>
            ),
    }
}

export function targetColumn<T extends { target: string | null }>(
    header: string,
): ColumnDef<DataTableFeatures, T> {
    return {
        id: "target",
        header,
        cell: ({ row }) =>
            row.original.target ? (
                <span className="font-mono text-xs text-muted-foreground">
                    {row.original.target}
                </span>
            ) : (
                <span className="text-muted-foreground">—</span>
            ),
    }
}

export function codeColumn<T extends RowData>(
    id: string,
    header: string,
    value: (row: T) => string,
): ColumnDef<DataTableFeatures, T> {
    return {
        id,
        header,
        cell: ({ row }) => <span className="font-mono text-xs">{value(row.original)}</span>,
    }
}
