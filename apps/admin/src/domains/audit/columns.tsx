import { useMemo } from "react"
import type { AdminAuditItem } from "@shop/api/sdk"
import { TimeText } from "@shop/app-kit/display"
import type { DataTableFeatures } from "@shop/ui-web"
import type { ColumnDef } from "@tanstack/react-table"
import { useT } from "#/locales/use-t"
import { ACTION_KEYS, TARGET_KEYS } from "./constants"

function AuditActionCell({ code }: { code: string }) {
    const t = useT()
    const key = ACTION_KEYS[code]
    return <>{key ? t(key) : code}</>
}

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
                header: t("audit.field.time"),
                meta: { variant: "muted", className: "tabular-nums whitespace-nowrap" },
                cell: ({ row }) => <TimeText iso={row.original.createdAt} />,
            },
            {
                accessorKey: "action",
                header: t("audit.field.action"),
                meta: { variant: "strong" },
                cell: ({ row }) => <AuditActionCell code={row.original.action} />,
            },
            {
                accessorKey: "operatorName",
                header: t("audit.field.operator"),
                cell: ({ row }) => (
                    <div className="flex flex-col">
                        <span>{row.original.operatorName || t("audit.operator.unknown")}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                            {row.original.operatorId}
                        </span>
                    </div>
                ),
            },
            {
                accessorKey: "targetId",
                header: t("audit.field.target"),
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
                header: t("audit.field.detail"),
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
