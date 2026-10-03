import { MoneyText, TimeText } from "@shop/app-kit/display"
import { Badge, type DataTableFeatures } from "@shop/ui-web"
import type { AdminCouponItem } from "@shop/api/sdk"
import type { ColumnDef } from "@tanstack/react-table"
import { useT } from "#/locales/use-t"
import { actionsColumn } from "#/shared/ui/columns"
import { SOURCE_LABEL, couponOpsStatusMeta } from "./constants"
import { CouponVoidAction } from "./void-action"

/** 状态徽章：文案在渲染边界用 t() 从 catalog 换成句子，未知码回退码本身（列定义留模块级，故收进组件） */
function CouponStatusBadge({ status }: { status: string }) {
    const t = useT()
    const meta = couponOpsStatusMeta(status)
    return <Badge variant={meta.variant}>{meta.labelKey ? t(meta.labelKey) : status}</Badge>
}

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
        // 金额列右对齐 + 等宽数字（与卖家端订单/退款表同一口径）：数字比大小靠竖着对齐读
        meta: { className: "text-right tabular-nums" },
        cell: ({ row }) => <MoneyText value={row.original.discount} />,
    },
    {
        accessorKey: "status",
        header: "状态",
        cell: ({ row }) => <CouponStatusBadge status={row.original.status} />,
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
        cell: ({ row }) => (
            <>
                <TimeText iso={row.original.effectiveAt} /> -{" "}
                <TimeText iso={row.original.expireAt} />
            </>
        ),
    },
    {
        accessorKey: "orderId",
        header: "关联订单",
        meta: { variant: "muted", className: "font-mono text-xs" },
        cell: ({ row }) => row.original.orderId ?? "—",
    },
    actionsColumn((coupon) => <CouponVoidAction coupon={coupon} />),
]
