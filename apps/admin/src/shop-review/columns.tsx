import { useMemo } from "react"
import type { ShopReviewItem } from "@shop/api/sdk"
import { TimeText } from "@shop/app-kit/display"
import { Badge, MaskedValueCell, type DataTableFeatures } from "@shop/ui-web"
import type { ColumnDef } from "@tanstack/react-table"

import { useT } from "#/locales/use-t"
import { actionsColumn } from "#/shared/ui/columns"
import { STATUS_BADGE } from "./constants"
import { ReviewActions } from "./review-actions"

export function useReviewColumns({
    onRevealPhone,
    revealingId,
}: {
    onRevealPhone: (item: ShopReviewItem) => void
    revealingId: string | undefined
}) {
    const t = useT()
    return useMemo<ColumnDef<DataTableFeatures, ShopReviewItem>[]>(
        () => [
            {
                accessorKey: "shopName",
                header: t("shopReview.col.shopName"),
                meta: { variant: "strong" },
                cell: ({ row }) => row.original.shopName,
            },
            {
                accessorKey: "ownerPhone",
                header: t("shopReview.col.ownerPhone"),
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
                header: t("shopReview.col.status"),
                cell: ({ row }) => {
                    const badge = STATUS_BADGE[row.original.status]
                    return <Badge variant={badge.variant}>{t(badge.labelKey)}</Badge>
                },
            },
            {
                accessorKey: "reason",
                header: t("shopReview.col.reason"),
                meta: { variant: "muted" },
                cell: ({ row }) =>
                    row.original.reason ? (
                        <span
                            className="block max-w-48 truncate"
                            title={row.original.reason}
                        >
                            {row.original.reason}
                        </span>
                    ) : (
                        "—"
                    ),
            },
            {
                accessorKey: "createdAt",
                header: t("shopReview.col.createdAt"),
                meta: { variant: "muted", className: "tabular-nums" },
                cell: ({ row }) => <TimeText iso={row.original.createdAt} />,
            },
            {
                accessorKey: "decidedAt",
                header: t("shopReview.col.decidedAt"),
                meta: { variant: "muted", className: "tabular-nums" },
                cell: ({ row }) =>
                    row.original.decidedAt ? <TimeText iso={row.original.decidedAt} /> : "—",
            },
            actionsColumn((item) => <ReviewActions item={item} />),
        ],
        [onRevealPhone, revealingId, t],
    )
}
