import { useMemo } from "react"
import type { AdminStaffItem, AdminUserItem } from "@shop/api/sdk"
import { TimeText } from "@shop/app-kit/display"
import { Badge, type DataTableFeatures } from "@shop/ui-web"
import type { ColumnDef } from "@tanstack/react-table"
import { useT } from "#/locales/use-t"
import { actionsColumn } from "#/shared/ui/columns"
import { STAFF_STATUS_META, USER_STATUS_META } from "./constants"
import { staffRoleLabel } from "./staff-form"
import { AccountStatusAction } from "./status-action"
import { StaffRoleAction } from "./role-action"

export function useUserColumns(): ColumnDef<DataTableFeatures, AdminUserItem>[] {
    const t = useT()
    return useMemo(
        () => [
            {
                accessorKey: "phone",
                header: t("account.col.phone"),
                meta: { variant: "strong" },
            },
            {
                accessorKey: "nickname",
                header: t("account.col.nickname"),
                cell: ({ row }) => row.original.nickname || "—",
            },
            {
                accessorKey: "status",
                header: t("account.col.status"),
                cell: ({ row }) => {
                    const meta = USER_STATUS_META[row.original.status]
                    return <Badge variant={meta.variant}>{t(meta.labelKey)}</Badge>
                },
            },
            {
                accessorKey: "lastLoginAt",
                header: t("account.col.lastLogin"),
                meta: { variant: "muted", className: "tabular-nums" },
                cell: ({ row }) =>
                    row.original.lastLoginAt ? <TimeText iso={row.original.lastLoginAt} /> : "—",
            },
            {
                accessorKey: "createdAt",
                header: t("account.col.registeredAt"),
                meta: { variant: "muted", className: "tabular-nums" },
                cell: ({ row }) => <TimeText iso={row.original.createdAt} />,
            },
            actionsColumn((item) => (
                <AccountStatusAction
                    kind="user"
                    item={item}
                />
            )),
        ],
        [t],
    )
}

export function useStaffColumns(): ColumnDef<DataTableFeatures, AdminStaffItem>[] {
    const t = useT()
    return useMemo(
        () => [
            {
                accessorKey: "employeeNo",
                header: t("account.col.employeeNo"),
                meta: { variant: "strong" },
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
                    const meta = STAFF_STATUS_META[row.original.status]
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
                    <AccountStatusAction
                        kind="staff"
                        item={item}
                    />
                </div>
            )),
        ],
        [t],
    )
}
