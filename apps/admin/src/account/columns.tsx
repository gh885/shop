import type { AdminStaffItem, AdminUserItem } from "@shop/api/sdk"
import { formatDateTime } from "@shop/app-kit"
import { Badge, type DataTableFeatures } from "@shop/ui-web"
import type { ColumnDef } from "@tanstack/react-table"
import { actionsColumn } from "#/shared/ui/columns"
import { STAFF_STATUS_META, USER_STATUS_META } from "./constants"
import { staffRoleLabel } from "./staff-form"
import { AccountStatusAction } from "./status-action"
import { StaffRoleAction } from "./role-action"

export const userColumns: ColumnDef<DataTableFeatures, AdminUserItem>[] = [
    { accessorKey: "phone", header: "手机号", meta: { variant: "strong" } },
    {
        accessorKey: "nickname",
        header: "昵称",
        cell: ({ row }) => row.original.nickname || "—",
    },
    {
        accessorKey: "status",
        header: "状态",
        cell: ({ row }) => {
            const meta = USER_STATUS_META[row.original.status]
            return <Badge variant={meta.variant}>{meta.label}</Badge>
        },
    },
    {
        accessorKey: "lastLoginAt",
        header: "最近登录",
        meta: { variant: "muted", className: "tabular-nums" },
        cell: ({ row }) =>
            row.original.lastLoginAt ? formatDateTime(row.original.lastLoginAt) : "—",
    },
    {
        accessorKey: "createdAt",
        header: "注册时间",
        meta: { variant: "muted", className: "tabular-nums" },
        cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
    actionsColumn((item) => (
        <AccountStatusAction
            kind="user"
            item={item}
        />
    )),
]

export const staffColumns: ColumnDef<DataTableFeatures, AdminStaffItem>[] = [
    { accessorKey: "employeeNo", header: "工号", meta: { variant: "strong" } },
    {
        accessorKey: "displayName",
        header: "姓名",
        cell: ({ row }) => row.original.displayName || "—",
    },
    {
        accessorKey: "role",
        header: "岗位",
        cell: ({ row }) => staffRoleLabel(row.original.role),
    },
    {
        accessorKey: "status",
        header: "状态",
        cell: ({ row }) => {
            const meta = STAFF_STATUS_META[row.original.status]
            return <Badge variant={meta.variant}>{meta.label}</Badge>
        },
    },
    {
        accessorKey: "createdAt",
        header: "创建时间",
        meta: { variant: "muted", className: "tabular-nums" },
        cell: ({ row }) => formatDateTime(row.original.createdAt),
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
]
