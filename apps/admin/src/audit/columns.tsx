import type { AdminAuditItem } from "@shop/api/sdk"
import { TimeText } from "@shop/app-kit"
import type { DataTableFeatures } from "@shop/ui-web"
import type { ColumnDef } from "@tanstack/react-table"
import { ACTION_LABEL, TARGET_LABEL } from "./constants"

/**
 * 审计列表的列。
 *
 * 中文一律查词表（`ACTION_LABEL` / `TARGET_LABEL`），查不到就退回码本身：后端先加了动作、
 * 前端还没补文案时，显示码比显示空白更容易被认出来（那是「有一条我们没归类的新动作」）。
 */
export const auditColumns: ColumnDef<DataTableFeatures, AdminAuditItem>[] = [
    {
        accessorKey: "createdAt",
        header: "时间",
        meta: { variant: "muted", className: "tabular-nums whitespace-nowrap" },
        cell: ({ row }) => <TimeText iso={row.original.createdAt} />,
    },
    {
        accessorKey: "action",
        header: "动作",
        meta: { variant: "strong" },
        cell: ({ row }) => ACTION_LABEL[row.original.action] ?? row.original.action,
    },
    {
        accessorKey: "operatorName",
        header: "操作人",
        cell: ({ row }) => (
            <div className="flex flex-col">
                <span>{row.original.operatorName || "未知操作人"}</span>
                <span className="font-mono text-xs text-muted-foreground">
                    {row.original.operatorId}
                </span>
            </div>
        ),
    },
    {
        accessorKey: "targetId",
        header: "操作对象",
        cell: ({ row }) => (
            <div className="flex flex-col">
                <span>{TARGET_LABEL[row.original.targetType] ?? row.original.targetType}</span>
                <span className="font-mono text-xs text-muted-foreground">
                    {row.original.targetId}
                </span>
            </div>
        ),
    },
    {
        accessorKey: "detail",
        header: "说明",
        meta: { variant: "muted" },
        cell: ({ row }) =>
            row.original.detail ? (
                <span
                    className="block max-w-72 truncate"
                    title={row.original.detail}
                >
                    {row.original.detail}
                </span>
            ) : (
                "—"
            ),
    },
]
