import { useMemo } from "react"
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

/** 列表列：表头是用户可见文案，所以整张列数组跟着 `t` 走（模块级常量取不到 `t`） */
export function useCouponColumns(): ColumnDef<DataTableFeatures, AdminCouponItem>[] {
    const t = useT()
    return useMemo(
        () => [
            {
                accessorKey: "name",
                header: t("coupon.col.name"),
                meta: { variant: "strong" },
            },
            {
                accessorKey: "shopName",
                header: t("coupon.col.shopName"),
                cell: ({ row }) => row.original.shopName ?? "—",
            },
            {
                accessorKey: "userId",
                header: t("coupon.col.userId"),
                meta: { variant: "muted", className: "font-mono text-xs" },
            },
            {
                accessorKey: "discount",
                header: t("coupon.col.discount"),
                // 金额列右对齐 + 等宽数字（与卖家端订单/退款表同一口径）：数字比大小靠竖着对齐读
                meta: { className: "text-right tabular-nums" },
                cell: ({ row }) => <MoneyText value={row.original.discount} />,
            },
            {
                accessorKey: "status",
                header: t("coupon.col.status"),
                cell: ({ row }) => <CouponStatusBadge status={row.original.status} />,
            },
            {
                accessorKey: "source",
                header: t("coupon.col.source"),
                cell: ({ row }) => {
                    const key = SOURCE_LABEL[row.original.source]
                    return key ? t(key) : row.original.source
                },
            },
            {
                accessorKey: "expireAt",
                header: t("coupon.col.validity"),
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
                header: t("coupon.col.orderId"),
                meta: { variant: "muted", className: "font-mono text-xs" },
                cell: ({ row }) => row.original.orderId ?? "—",
            },
            actionsColumn((coupon) => <CouponVoidAction coupon={coupon} />),
        ],
        [t],
    )
}
