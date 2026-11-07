import { useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useInfiniteQuery } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import type { ReviewView } from "@shop/api/sdk"
import { TimeText } from "@shop/app-kit/display"
import {
    Badge,
    Button,
    DataTable,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogTitle,
    Textarea,
    confirm,
    type DataTableFeatures,
} from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { actionsColumn } from "#/shared/ui/columns"
import { PageHeader } from "#/shared/ui/page-header"
import { REVIEW_STATUSES, REVIEW_STATUS_META, type ReviewStatus } from "#/domains/review/constants"
import { adminReviewsOptions, useHideReview, useRestoreReview } from "#/domains/review/queries"
import { usePagedTable } from "#/shared/lib/paged-table"
import { ListBody } from "#/shared/ui/list-body"

export const Route = createFileRoute("/_authenticated/reviews")({
    component: ReviewsRoute,
})

/**
 * 评价治理：全量列表 + 隐藏/恢复。没有「删除」——评价是对交易事实的记录，只下架不销毁；
 * 隐藏可逆（恢复端点在），理由进审计。
 */
function ReviewsRoute() {
    const t = useT()
    const [status, setStatus] = useState<ReviewStatus | undefined>(undefined)
    const [hiding, setHiding] = useState<ReviewView | undefined>()
    const query = useInfiniteQuery(adminReviewsOptions(status))
    const rows = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
    const columns = useReviewColumns(setHiding)

    const table = usePagedTable<ReviewView>({
        columns,
        rows,
        total: rows.length,
        page: 1,
        size: 20,
        onPageChange: () => {},
    })

    return (
        <div className="space-y-4">
            <PageHeader
                title={t("review.title")}
                description={t("review.description")}
            />
            <div className="flex gap-2">
                <Button
                    variant={status === undefined ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatus(undefined)}
                >
                    {t("review.filter.all")}
                </Button>
                {REVIEW_STATUSES.map((option) => (
                    <Button
                        key={option}
                        variant={status === option ? "default" : "outline"}
                        size="sm"
                        onClick={() => setStatus(option)}
                    >
                        {t(REVIEW_STATUS_META[option].labelKey)}
                    </Button>
                ))}
            </div>
            <DataTable
                table={table}
                emptyContent={t("review.empty")}
            >
                <ListBody
                    isPending={query.isPending}
                    columns={columns.length}
                />
            </DataTable>
            {query.hasNextPage && (
                <div className="flex justify-center">
                    <Button
                        variant="outline"
                        disabled={query.isFetchingNextPage}
                        onClick={() => void query.fetchNextPage()}
                    >
                        {t("review.loadMore")}
                    </Button>
                </div>
            )}
            <HideDialog
                row={hiding}
                onClose={() => setHiding(undefined)}
            />
        </div>
    )
}

function useReviewColumns(
    onHide: (row: ReviewView) => void,
): ColumnDef<DataTableFeatures, ReviewView>[] {
    const t = useT()
    const restore = useRestoreReview()
    return useMemo(
        () => [
            {
                accessorKey: "createdAt",
                header: t("review.col.createdAt"),
                meta: { variant: "muted", className: "tabular-nums" },
                cell: ({ row }) => <TimeText iso={row.original.createdAt} />,
            },
            {
                accessorKey: "title",
                header: t("review.col.product"),
                cell: ({ row }) => (
                    <span className="line-clamp-1 max-w-60">{row.original.title}</span>
                ),
            },
            {
                accessorKey: "overall",
                header: t("review.col.overall"),
                meta: { className: "tabular-nums" },
                cell: ({ row }) =>
                    row.original.overall == null ? (
                        <span className="text-muted-foreground">—</span>
                    ) : (
                        <span className="text-cta-alt">{"★".repeat(row.original.overall)}</span>
                    ),
            },
            {
                accessorKey: "content",
                header: t("review.col.content"),
                cell: ({ row }) => (
                    <span className="line-clamp-2 max-w-96 text-sm">
                        {row.original.content || "—"}
                        {row.original.content2
                            ? ` / ${t("review.appendTag")}：${row.original.content2}`
                            : ""}
                    </span>
                ),
            },
            {
                accessorKey: "replyContent",
                header: t("review.col.reply"),
                cell: ({ row }) =>
                    row.original.replyContent ? (
                        <Badge variant="info">{t("review.repliedTag")}</Badge>
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    ),
            },
            {
                accessorKey: "status",
                header: t("review.col.status"),
                cell: ({ row }) => {
                    // 状态词表来自后端枚举（pending/published/hidden），as 断言后查表必有值
                    const meta = REVIEW_STATUS_META[row.original.status as ReviewStatus]
                    return <Badge variant={meta.variant}>{t(meta.labelKey)}</Badge>
                },
            },
            actionsColumn((row) => (
                <ReviewActions
                    row={row}
                    onHide={onHide}
                    restore={restore}
                />
            )),
        ],
        [t, restore, onHide],
    )
}

function ReviewActions({
    row,
    onHide,
    restore,
}: {
    row: ReviewView
    onHide: (row: ReviewView) => void
    restore: ReturnType<typeof useRestoreReview>
}) {
    const t = useT()
    const hidden = row.status === "hidden"
    const actionable = row.status === "published" || hidden

    return (
        <div className="flex justify-end gap-2">
            {hidden ? (
                <Button
                    variant="outline"
                    size="sm"
                    disabled={!actionable || restore.isPending}
                    onClick={async () => {
                        const ok = await confirm({
                            title: t("review.restore.title"),
                            description: t("review.restore.confirm"),
                            tone: "default",
                            action: () => restore.mutateAsync(row.id),
                        })
                        void ok
                    }}
                >
                    {t("review.restore.action")}
                </Button>
            ) : (
                <Button
                    variant="outline"
                    size="sm"
                    disabled={!actionable}
                    onClick={() => onHide(row)}
                >
                    {t("review.hide.action")}
                </Button>
            )}
        </div>
    )
}

function HideDialog({ row, onClose }: { row: ReviewView | undefined; onClose: () => void }) {
    const t = useT()
    const hide = useHideReview()
    const [reason, setReason] = useState("")

    const submit = async () => {
        if (!row) return
        await hide.mutateAsync({ id: row.id, reason: reason.trim() || undefined })
        setReason("")
        onClose()
    }

    return (
        <Dialog
            open={row !== undefined}
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogTitle>{t("review.hide.title")}</DialogTitle>
                <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t("review.hide.placeholder")}
                    rows={4}
                />
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={onClose}
                    >
                        {t("review.hide.cancel")}
                    </Button>
                    <Button
                        variant="destructive"
                        disabled={hide.isPending}
                        onClick={() => void submit()}
                    >
                        {t("review.hide.action")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
