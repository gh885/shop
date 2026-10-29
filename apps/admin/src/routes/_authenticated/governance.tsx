import { useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import type { QueueItem } from "@shop/api/sdk"
import type { ColumnDef } from "@tanstack/react-table"
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
import {
    ONBOARDING_STATUS_META,
    ONBOARDING_STATUSES,
    type OnboardingStatus,
} from "#/domains/governance/constants"
import {
    sellerQueueOptions,
    useApproveMerchant,
    useRejectMerchant,
} from "#/domains/governance/queries"
import { usePagedTable } from "#/shared/lib/paged-table"
import { ListBody } from "#/shared/ui/list-body"

type QueueRow = QueueItem & { id: string }

export const Route = createFileRoute("/_authenticated/governance")({
    component: GovernanceRoute,
})

/**
 * 入驻审核队列。后端封顶 100 条且靠人处理，一次拉全；状态档切换不走 URL search——
 * 队列是一次性工作面，不承载分享与回跳。
 */
function GovernanceRoute() {
    const t = useT()
    const [status, setStatus] = useState<OnboardingStatus | undefined>(undefined)
    const [rejecting, setRejecting] = useState<QueueRow | undefined>()
    const query = useQuery(sellerQueueOptions(status))
    const rows: QueueRow[] = (query.data ?? []).map((item) => ({
        merchantId: item.merchantId,
        name: item.name,
        status: item.status,
        level: item.level,
        updatedAt: item.updatedAt,
        id: item.merchantId,
    }))
    const columns = useQueueColumns(setRejecting)

    const table = usePagedTable<QueueRow>({
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
                title={t("governance.title")}
                description={t("governance.description")}
            />
            <div className="flex gap-2">
                <FilterChip
                    active={status === undefined}
                    label={t("governance.filter.all")}
                    onClick={() => setStatus(undefined)}
                />
                {ONBOARDING_STATUSES.map((option) => (
                    <FilterChip
                        key={option}
                        active={status === option}
                        label={t(ONBOARDING_STATUS_META[option].labelKey)}
                        onClick={() => setStatus(option)}
                    />
                ))}
            </div>
            <DataTable
                table={table}
                emptyContent={t("governance.queue.empty")}
            >
                <ListBody
                    isPending={query.isPending}
                    columns={columns.length}
                />
            </DataTable>
            <RejectDialog
                item={rejecting}
                onClose={() => setRejecting(undefined)}
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

function useQueueColumns(
    onReject: (item: QueueRow) => void,
): ColumnDef<DataTableFeatures, QueueRow>[] {
    const t = useT()
    const approve = useApproveMerchant()
    return useMemo(
        () => [
            {
                accessorKey: "name",
                header: t("governance.col.merchant"),
                meta: { variant: "strong" },
                cell: ({ row }) => row.original.name,
            },
            {
                accessorKey: "status",
                header: t("governance.col.status"),
                cell: ({ row }) => {
                    const meta =
                        ONBOARDING_STATUS_META[
                            ONBOARDING_STATUSES.find((s) => s === row.original.status) ?? "active"
                        ]
                    return <Badge variant={meta.variant}>{t(meta.labelKey)}</Badge>
                },
            },
            {
                accessorKey: "level",
                header: t("governance.col.level"),
            },
            {
                accessorKey: "updatedAt",
                header: t("governance.col.updatedAt"),
                meta: { variant: "muted", className: "tabular-nums" },
                cell: ({ row }) => <TimeText iso={row.original.updatedAt} />,
            },
            actionsColumn((item) => (
                <QueueActions
                    item={item}
                    approve={approve}
                    onReject={() => onReject(item)}
                />
            )),
        ],
        [t, approve, onReject],
    )
}

function QueueActions({
    item,
    approve,
    onReject,
}: {
    item: QueueRow
    approve: ReturnType<typeof useApproveMerchant>
    onReject: () => void
}) {
    const t = useT()
    const actionable = item.status === "applied"

    return (
        <div className="flex justify-end gap-2">
            <Button
                variant="outline"
                size="sm"
                disabled={!actionable || approve.isPending}
                onClick={async () => {
                    const ok = await confirm({
                        title: t("governance.approve.title"),
                        description: t("governance.approve.confirm", {
                            target: item.name,
                        }),
                        tone: "default",
                        action: () => approve.mutateAsync(item.merchantId),
                    })
                    void ok
                }}
            >
                {t("governance.approve.action")}
            </Button>
            <Button
                variant="outline"
                size="sm"
                disabled={!actionable}
                onClick={onReject}
            >
                {t("governance.reject.action")}
            </Button>
        </div>
    )
}

function RejectDialog({ item, onClose }: { item: QueueRow | undefined; onClose: () => void }) {
    const t = useT()
    const reject = useRejectMerchant()
    const [reason, setReason] = useState("")

    const submit = async () => {
        if (!item || !reason.trim()) return
        await reject.mutateAsync({ merchantId: item.merchantId, reason: reason.trim() })
        setReason("")
        onClose()
    }

    return (
        <Dialog
            open={item !== undefined}
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogTitle>{t("governance.reject.title")}</DialogTitle>
                <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t("governance.reject.placeholder")}
                    rows={4}
                />
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={onClose}
                    >
                        {t("governance.reject.cancel")}
                    </Button>
                    <Button
                        variant="destructive"
                        disabled={!reason.trim() || reject.isPending}
                        onClick={() => void submit()}
                    >
                        {t("governance.reject.action")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
