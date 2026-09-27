import { formatDateTime } from "@shop/app-kit"
import { formatMoney } from "@shop/common"
import { Badge, type DataTableFeatures } from "@shop/ui-web"
import type { AdminCouponItem } from "@shop/api/sdk"
import type { ColumnDef } from "@tanstack/react-table"
import { actionsColumn } from "#/shared/ui/columns"
import { SOURCE_LABEL, couponOpsStatusMeta } from "./constants"
import { CouponVoidAction } from "./void-action"

export const couponColumns: ColumnDef<DataTableFeatures, AdminCouponItem>[] = [
    { accessorKey: "name", header: "优惠券", meta: { variant: "strong" } },
    {
        accessorKey: "shopName",
        header: "所属店铺",
        cell: ({ row }) => row.original.shopName ?? "—",
    },
    {
        accessorKey: "userId",
        header: "持券人 ID",
        meta: { variant: "muted", className: "font-mono text-xs" },
    },
    {
        accessorKey: "discount",
        header: "减免额",
        cell: ({ row }) => formatMoney(row.original.discount),
    },
    {
        accessorKey: "status",
        header: "状态",
        cell: ({ row }) => {
            const meta = couponOpsStatusMeta(row.original.status)
            return <Badge variant={meta.variant}>{meta.label}</Badge>
        },
    },
    {
        accessorKey: "source",
        header: "来源",
        cell: ({ row }) => SOURCE_LABEL[row.original.source] ?? row.original.source,
    },
    {
        accessorKey: "expireAt",
        header: "有效期",
        meta: { variant: "muted", className: "tabular-nums" },
        cell: ({ row }) =>
            `${formatDateTime(row.original.effectiveAt)} - ${formatDateTime(row.original.expireAt)}`,
    },
    {
        accessorKey: "orderId",
        header: "关联订单",
        meta: { variant: "muted", className: "font-mono text-xs" },
        cell: ({ row }) => row.original.orderId ?? "—",
    },
    actionsColumn((coupon) => <CouponVoidAction coupon={coupon} />),
]
