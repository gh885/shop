import { useMemo } from "react"
import type { AdminBuyerView, StaffItem } from "@shop/api/sdk"
import { TimeText } from "@shop/app-kit/display"
import { Badge, type DataTableFeatures } from "@shop/ui-web"
import type { ColumnDef } from "@tanstack/react-table"
import { useT } from "#/locales/use-t"
import { actionsColumn } from "#/shared/ui/columns"
import { STAFF_STATUS_META, USER_STATUS_META } from "./constants"
import { staffRoleLabel } from "./staff-form"
import { AccountStatusAction, StaffStatusAction } from "./status-action"
import { StaffRoleAction } from "./role-action"

/** 买家行：契约给的 id 字段叫 `buyerId`，表格要 `id`，在 mapper 层补一次 */
export type BuyerRow = AdminBuyerView & { id: string }

export function useBuyerColumns(): ColumnDef<DataTableFeatures, BuyerRow>[] {
    const t = useT()
    return useMemo(
        () => [
            {
                accessorKey: "phone",
                header: t("account.col.phone"),
                meta: { variant: "strong" },
                cell: ({ row }) => row.original.phone || "—",
            },
            {
                accessorKey: "displayName",
                header: t("account.col.nickname"),
                cell: ({ row }) => row.original.displayName || "—",
            },
            {
                accessorKey: "status",
                header: t("account.col.status"),
                cell: ({ row }) => {
                    const meta = USER_STATUS_META[row.original.status as "active" | "disabled"]
                    return <Badge variant={meta.variant}>{t(meta.labelKey)}</Badge>
                },
            },
            {
                accessorKey: "createdAt",
                header: t("account.col.registeredAt"),
                meta: { variant: "muted", className: "tabular-nums" },
                cell: ({ row }) =>
                    row.original.createdAt ? <TimeText iso={row.original.createdAt} /> : "—",
            },
            actionsColumn((item) => <AccountStatusAction item={item} />),
        ],
        [t],
    )
}

export function useStaffColumns(): ColumnDef<DataTableFeatures, StaffItem>[] {
    const t = useT()
    return useMemo(
        () => [
            {
                accessorKey: "loginName",
                header: t("account.col.loginName"),
                meta: { variant: "strong", className: "font-mono text-xs" },
            },
            {
                accessorKey: "displayName",
                header: t("account.col.displayName"),
                cell: ({ row }) => row.original.displayName || "—",
            },
            {
                accessorKey: "role",
                header: t("account.col.role"),
                cell: ({ row }) => staffRoleLabel(row.original.role, t),
            },
            {
                accessorKey: "status",
                header: t("account.col.status"),
                cell: ({ row }) => {
                    const meta = STAFF_STATUS_META[row.original.status as "active" | "disabled"]
                    return <Badge variant={meta.variant}>{t(meta.labelKey)}</Badge>
                },
            },
            {
                accessorKey: "createdAt",
                header: t("account.col.createdAt"),
                meta: { variant: "muted", className: "tabular-nums" },
                cell: ({ row }) => <TimeText iso={row.original.createdAt} />,
            },
            actionsColumn((item) => (
                <div className="flex justify-end gap-2">
                    <StaffRoleAction staff={item} />
                    <StaffStatusAction staff={item} />
                </div>
            )),
        ],
        [t],
    )
}
