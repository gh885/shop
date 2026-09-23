import { useMemo } from "react"
import type { ShopReviewItem } from "@shop/api/sdk"
import { formatDateTime } from "@shop/app-kit"
import { Badge, MaskedValueCell, type DataTableFeatures } from "@shop/ui-web"
import type { ColumnDef } from "@tanstack/react-table"

import { actionsColumn } from "#/shared/ui/columns"
import { STATUS_BADGE } from "./constants"
import { ReviewActions } from "./review-actions"

/**
 * 审核队列表格列。
 *
 * 列跟着页面状态走（不是模块级常量），因为联系电话那一行要能触发「取明文」：
 * 后端出参恒为掩码，点「查看」逐条索取，取到的号码写回列表缓存的这一行（ACC-79）。
 */
export function useReviewColumns({
    onRevealPhone,
    revealingId,
}: {
    onRevealPhone: (item: ShopReviewItem) => void
    revealingId: string | undefined
}) {
    return useMemo<ColumnDef<DataTableFeatures, ShopReviewItem>[]>(
        () => [
            {
                accessorKey: "shopName",
                header: "店铺名称",
                cell: ({ row }) => <span className="font-medium">{row.original.shopName}</span>,
            },
            {
                accessorKey: "ownerPhone",
                header: "联系电话",
                cell: ({ row }) => (
                    <MaskedValueCell
                        value={row.original.ownerPhone}
                        subject={row.original.shopName}
                        revealing={revealingId === row.original.id}
                        onReveal={() => onRevealPhone(row.original)}
                    />
                ),
            },
            {
                accessorKey: "status",
                header: "状态",
                cell: ({ row }) => {
                    const badge = STATUS_BADGE[row.original.status]
                    return <Badge variant={badge.variant}>{badge.label}</Badge>
                },
            },
            {
                accessorKey: "reason",
                header: "驳回理由",
                cell: ({ row }) =>
                    row.original.reason ? (
                        <span className="max-w-48 truncate text-muted-foreground">
                            {row.original.reason}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    ),
            },
            {
                accessorKey: "createdAt",
                header: "申请时间",
                cell: ({ row }) => (
                    <span className="tabular-nums text-muted-foreground">
                        {formatDateTime(row.original.createdAt)}
                    </span>
                ),
            },
            {
                accessorKey: "decidedAt",
                header: "处理时间",
                cell: ({ row }) =>
                    row.original.decidedAt ? (
                        <span className="tabular-nums text-muted-foreground">
                            {formatDateTime(row.original.decidedAt)}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    ),
            },
            actionsColumn((item) => <ReviewActions item={item} />),
        ],
        [onRevealPhone, revealingId],
    )
}
