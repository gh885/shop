import { useMemo } from "react"
import type { AdminShopItem } from "@shop/api/sdk"
import { TimeText } from "@shop/app-kit/display"
import { Badge, type DataTableFeatures } from "@shop/ui-web"
import type { ColumnDef } from "@tanstack/react-table"
import { useT } from "#/locales/use-t"
import { actionsColumn } from "#/shared/ui/columns"
import { SHOP_STATUS_META } from "./constants"
import { ShopResumeAction, ShopSuspendAction } from "./suspend-action"

export function useShopColumns(): ColumnDef<DataTableFeatures, AdminShopItem>[] {
    const t = useT()
    return useMemo(
        () => [
            { accessorKey: "name", header: "店铺名称", meta: { variant: "strong" } },
            {
                accessorKey: "ownerId",
                header: "店主 ID",
                meta: { variant: "muted", className: "font-mono text-xs" },
            },
            {
                accessorKey: "status",
                header: "状态",
                cell: ({ row }) => {
                    // 出参 status 是 string（后端对库内未知档位照实给值，不让整页 500）：查不到就显示原值
                    const meta = (
                        SHOP_STATUS_META as Record<
                            string,
                            (typeof SHOP_STATUS_META)[keyof typeof SHOP_STATUS_META] | undefined
                        >
                    )[row.original.status]
                    return (
                        <Badge variant={meta?.variant ?? "secondary"}>
                            {meta ? t(meta.labelKey) : row.original.status}
                        </Badge>
                    )
                },
            },
            {
                accessorKey: "createdAt",
                header: "创建时间",
                meta: { variant: "muted", className: "tabular-nums" },
                cell: ({ row }) => <TimeText iso={row.original.createdAt} />,
            },
            actionsColumn((shop) => (
                <div className="flex justify-end gap-2">
                    <ShopSuspendAction shop={shop} />
                    <ShopResumeAction shop={shop} />
                </div>
            )),
        ],
        [t],
    )
}
