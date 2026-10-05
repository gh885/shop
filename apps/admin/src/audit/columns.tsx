import { useMemo } from "react"
import type { AdminAuditItem } from "@shop/api/sdk"
import { TimeText } from "@shop/app-kit/display"
import type { DataTableFeatures } from "@shop/ui-web"
import type { ColumnDef } from "@tanstack/react-table"
import { useT } from "#/locales/use-t"
import { ACTION_KEYS, TARGET_KEYS } from "./constants"

/**
 * 审计列表的列。
 *
 * 中文一律查词表（`ACTION_KEYS` / `TARGET_KEYS`），查不到就退回码本身：后端先加了动作、
 * 前端还没补文案时，显示码比显示空白更容易被认出来（那是「有一条我们没归类的新动作」）。
 * 表头是用户可见文案，整张数组跟着 `t` 走（模块级常量取不到 `t`）。
 */

/** 动作那一格：命中词表用本端文案，未归类的新码退回码本身 */
function AuditActionCell({ code }: { code: string }) {
    const t = useT()
    const key = ACTION_KEYS[code]
    return <>{key ? t(key) : code}</>
}

/** 对象类型那一格：同「查不到退回码」口径 */
function AuditTargetCell({ code }: { code: string }) {
    const t = useT()
    const key = TARGET_KEYS[code]
    return <>{key ? t(key) : code}</>
}

export function useAuditColumns(): ColumnDef<DataTableFeatures, AdminAuditItem>[] {
    const t = useT()
    return useMemo(
        () => [
            {
                accessorKey: "createdAt",
                header: t("admin.audit.field.time"),
                meta: { variant: "muted", className: "tabular-nums whitespace-nowrap" },
                cell: ({ row }) => <TimeText iso={row.original.createdAt} />,
            },
            {
                accessorKey: "action",
                header: t("admin.audit.field.action"),
                meta: { variant: "strong" },
                cell: ({ row }) => <AuditActionCell code={row.original.action} />,
            },
            {
                accessorKey: "operatorName",
                header: t("admin.audit.field.operator"),
                cell: ({ row }) => (
                    <div className="flex flex-col">
                        <span>
                            {row.original.operatorName || t("admin.audit.operator.unknown")}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                            {row.original.operatorId}
                        </span>
                    </div>
                ),
            },
            {
                accessorKey: "targetId",
                header: t("admin.audit.field.target"),
                cell: ({ row }) => (
                    <div className="flex flex-col">
                        <span>
                            <AuditTargetCell code={row.original.targetType} />
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                            {row.original.targetId}
                        </span>
                    </div>
                ),
            },
            {
                accessorKey: "detail",
                header: t("admin.audit.field.detail"),
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
        ],
        [t],
    )
}
