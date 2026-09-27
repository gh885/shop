import type { ShipmentIssueResponse } from "@shop/api/sdk"
import { formatDateTime } from "@shop/app-kit"
import { Badge, type DataTableFeatures } from "@shop/ui-web"
import type { ColumnDef } from "@tanstack/react-table"
import { actionsColumn } from "#/shared/ui/columns"
import { ISSUE_TYPE_LABEL } from "./constants"
import { IssueResolveAction } from "./resolve-action"

export const issueColumns: ColumnDef<DataTableFeatures, ShipmentIssueResponse>[] = [
    {
        accessorKey: "type",
        header: "异常类型",
        cell: ({ row }) => {
            const meta = ISSUE_TYPE_LABEL[row.original.type] ?? {
                label: row.original.type,
                variant: "warning" as const,
            }
            return <Badge variant={meta.variant}>{meta.label}</Badge>
        },
    },
    {
        accessorKey: "shipmentId",
        header: "包裹",
        meta: { variant: "muted", className: "font-mono text-xs" },
    },
    {
        accessorKey: "detail",
        header: "异常说明",
        cell: ({ row }) =>
            row.original.detail ? (
                <span
                    className="block max-w-80 truncate"
                    title={row.original.detail}
                >
                    {row.original.detail}
                </span>
            ) : (
                "—"
            ),
    },
    {
        accessorKey: "detectedAt",
        header: "发现时间",
        meta: { variant: "muted", className: "tabular-nums whitespace-nowrap" },
        cell: ({ row }) => formatDateTime(row.original.detectedAt),
    },
    actionsColumn((issue) => <IssueResolveAction issue={issue} />),
]
