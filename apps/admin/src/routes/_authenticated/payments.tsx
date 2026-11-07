import { useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import type { SuspenseRow } from "@shop/api/sdk"
import { formatMoney } from "@shop/common/domain"
import { MoneyText, TimeText } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
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
import {
    SUSPENSE_REASONS,
    SUSPENSE_REASON_META,
    SUSPENSE_RESOLUTION_META,
    SUSPENSE_RESOLUTIONS,
    SUSPENSE_STATUSES,
    SUSPENSE_STATUS_META,
    type SuspenseStatus,
} from "#/domains/payment/constants"
import {
    suspenseListOptions,
    useDismissSuspense,
    useRefundSuspense,
} from "#/domains/payment/queries"
import { usePagedTable } from "#/shared/lib/paged-table"
import { ListBody } from "#/shared/ui/list-body"

export const Route = createFileRoute("/_authenticated/payments")({
    component: PaymentsRoute,
})

/**
 * 挂账工作台：钱到了但推进不了的统一出口。清单一次拉全、状态在前端筛；
 * 退款逐条确认（后端没有批量端点，这是刻意的），驳回必须写原因。
 */
function PaymentsRoute() {
    const t = useT()
    const [status, setStatus] = useState<SuspenseStatus | undefined>(undefined)
    const [dismissing, setDismissing] = useState<SuspenseRow | undefined>()
    const query = useQuery(suspenseListOptions())
    const rows = useMemo(() => {
        const all = query.data ?? []
        return status === undefined ? all : all.filter((row) => row.status === status)
    }, [query.data, status])
    const columns = useSuspenseColumns(setDismissing)

    const table = usePagedTable<SuspenseRow>({
        columns,
        rows,
        total: rows.length,
        page: 1,
        size: Math.max(rows.length, 20),
        onPageChange: () => {},
    })

    return (
        <div className="space-y-4">
            <PageHeader
                title={t("payment.title")}
                description={t("payment.description")}
            />
            <div className="flex gap-2">
                <FilterChip
                    active={status === undefined}
                    label={t("payment.filter.all")}
                    onClick={() => setStatus(undefined)}
                />
                {SUSPENSE_STATUSES.map((option) => (
                    <FilterChip
                        key={option}
                        active={status === option}
                        label={t(SUSPENSE_STATUS_META[option].labelKey)}
                        onClick={() => setStatus(option)}
                    />
                ))}
            </div>
            <DataTable
                table={table}
                emptyContent={t("payment.empty")}
            >
                <ListBody
                    isPending={query.isPending}
                    columns={columns.length}
                />
            </DataTable>
            <DismissDialog
                row={dismissing}
                onClose={() => setDismissing(undefined)}
            />
        </div>
    )
}

function FilterChip({
    active,
    label,
    onClick,
}: {
    active: boolean
    label: string
    onClick: () => void
}) {
    return (
        <Button
            variant={active ? "default" : "outline"}
            size="sm"
            onClick={onClick}
        >
            {label}
        </Button>
    )
}

function useSuspenseColumns(
    onDismiss: (row: SuspenseRow) => void,
): ColumnDef<DataTableFeatures, SuspenseRow>[] {
    const t = useT()
    const refund = useRefundSuspense()
    return useMemo(
        () => [
            {
                accessorKey: "createdAt",
                header: t("payment.col.createdAt"),
                meta: { variant: "muted", className: "tabular-nums" },
                cell: ({ row }) => <TimeText iso={row.original.createdAt} />,
            },
            {
                accessorKey: "reason",
                header: t("payment.col.reason"),
                cell: ({ row }) => {
                    const reason = SUSPENSE_REASONS.find((r) => r === row.original.reason)
                    return reason === undefined
                        ? row.original.reason
                        : t(SUSPENSE_REASON_META[reason].labelKey)
                },
            },
            {
                accessorKey: "amount",
                header: t("payment.col.amount"),
                meta: { className: "tabular-nums" },
                cell: ({ row }) => (
                    <MoneyText
                        value={{ amount: row.original.amount, currency: row.original.currency }}
                    />
                ),
            },
            {
                accessorKey: "channel",
                header: t("payment.col.channel"),
                meta: { variant: "muted" },
            },
            {
                accessorKey: "channelTxnId",
                header: t("payment.col.txn"),
                meta: { variant: "muted", className: "tabular-nums" },
            },
            {
                accessorKey: "status",
                header: t("payment.col.status"),
                cell: ({ row }) => {
                    const status = SUSPENSE_STATUSES.find((s) => s === row.original.status)
                    if (status === undefined) return row.original.status
                    const meta = SUSPENSE_STATUS_META[status]
                    const resolution = SUSPENSE_RESOLUTIONS.find(
                        (r) => r === row.original.resolution,
                    )
                    return (
                        <div className="flex items-center gap-2">
                            <Badge variant={meta.variant}>{t(meta.labelKey)}</Badge>
                            {resolution !== undefined && (
                                <span className="text-muted-foreground text-xs">
                                    {t(SUSPENSE_RESOLUTION_META[resolution].labelKey)}
                                </span>
                            )}
                        </div>
                    )
                },
            },
            actionsColumn((row) => (
                <SuspenseActions
                    row={row}
                    refund={refund}
                    onDismiss={() => onDismiss(row)}
                />
            )),
        ],
        [t, refund, onDismiss],
    )
}

function SuspenseActions({
    row,
    refund,
    onDismiss,
}: {
    row: SuspenseRow
    refund: ReturnType<typeof useRefundSuspense>
    onDismiss: () => void
}) {
    const t = useT()
    const { locale } = useI18n()
    const actionable = row.status === "open"

    return (
        <div className="flex justify-end gap-2">
            <Button
                variant="outline"
                size="sm"
                disabled={!actionable || refund.isPending}
                onClick={async () => {
                    const ok = await confirm({
                        title: t("payment.refund.title"),
                        description: t("payment.refund.confirm", {
                            amount: formatMoney(
                                { amount: row.amount, currency: row.currency },
                                locale,
                            ),
                        }),
                        tone: "default",
                        action: () => refund.mutateAsync(row.id),
                    })
                    void ok
                }}
            >
                {t("payment.refund.action")}
            </Button>
            <Button
                variant="outline"
                size="sm"
                disabled={!actionable}
                onClick={onDismiss}
            >
                {t("payment.dismiss.action")}
            </Button>
        </div>
    )
}

function DismissDialog({ row, onClose }: { row: SuspenseRow | undefined; onClose: () => void }) {
    const t = useT()
    const dismiss = useDismissSuspense()
    const [note, setNote] = useState("")

    const submit = async () => {
        if (!row || !note.trim()) return
        await dismiss.mutateAsync({ id: row.id, note: note.trim() })
        setNote("")
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
                <DialogTitle>{t("payment.dismiss.title")}</DialogTitle>
                <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t("payment.dismiss.placeholder")}
                    rows={4}
                />
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={onClose}
                    >
                        {t("payment.dismiss.cancel")}
                    </Button>
                    <Button
                        variant="destructive"
                        disabled={!note.trim() || dismiss.isPending}
                        onClick={() => void submit()}
                    >
                        {t("payment.dismiss.action")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
