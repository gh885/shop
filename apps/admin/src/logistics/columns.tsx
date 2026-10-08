import { useMemo } from "react"
import type { ShipmentIssueResponse } from "@shop/api/sdk"
import { TimeText } from "@shop/app-kit/display"
import { Badge, type DataTableFeatures } from "@shop/ui-web"
import type { ColumnDef } from "@tanstack/react-table"
import { useT } from "#/locales/use-t"
import { actionsColumn } from "#/shared/ui/columns"
import { ISSUE_TYPE_LABEL } from "./constants"
import { IssueResolveAction } from "./resolve-action"

/** 待办列表列：表头是用户可见文案，整张数组跟着 `t` 走（模块级常量取不到 `t`） */
export function useIssueColumns(): ColumnDef<DataTableFeatures, ShipmentIssueResponse>[] {
    const t = useT()
    return useMemo(
        () => [
            {
                accessorKey: "type",
                header: t("logistics.col.type"),
                cell: ({ row }) => {
                    // 出参 type 是自由 string（后端对库里的陌生档位照实给值）：查不到就显示原码 + 中性色
                    const meta = ISSUE_TYPE_LABEL[row.original.type]
                    return (
                        <Badge variant={meta?.variant ?? "warning"}>
                            {meta ? t(meta.labelKey) : row.original.type}
                        </Badge>
                    )
                },
            },
            {
                accessorKey: "shipmentId",
                header: t("logistics.col.shipment"),
                meta: { variant: "muted", className: "font-mono text-xs" },
            },
            {
                accessorKey: "detail",
                header: t("logistics.col.detail"),
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
                header: t("logistics.col.detectedAt"),
                meta: { variant: "muted", className: "tabular-nums whitespace-nowrap" },
                cell: ({ row }) => <TimeText iso={row.original.detectedAt} />,
            },
            actionsColumn((issue) => <IssueResolveAction issue={issue} />),
        ],
        [t],
    )
}
