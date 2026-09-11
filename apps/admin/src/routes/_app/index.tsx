import { useState } from "react"
import { ShopReviewStatus } from "@shop/api/sdk"
import { z } from "zod"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { notify } from "@shop/app-kit"
import {
    Badge,
    Button,
    ConfirmDialog,
    DataTable,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Spinner,
    Textarea,
    type DataTableFilterConfig,
} from "@shop/ui-web"
import { type ShopReviewItem, reviewListOptions, REVIEW_LIST_KEY, adminApi } from "#/shared/lib/api"
import type { ColumnDef, ColumnFiltersState } from "@tanstack/react-table"
import { isValid, format } from "date-fns"

/** 店铺审核状态（与后端枚举对齐） */
const ShopReviewStatusSchema = z.enum(ShopReviewStatus)

export const Route = createFileRoute("/_app/")({
    validateSearch: z.object({
        status: ShopReviewStatusSchema.optional(),
        page: z.coerce.number().int().min(1).catch(1),
        size: z.coerce.number().int().min(1).catch(20),
    }),
    component: ReviewPage,
})

const STATUS_BADGE: Record<ShopReviewStatus, { label: string; className: string }> = {
    PENDING: {
        label: "待审核",
        className: "bg-warning-subtle text-warning-subtle-foreground",
    },
    APPROVED: {
        label: "已通过",
        className: "bg-success-subtle text-success-subtle-foreground",
    },
    REJECTED: {
        label: "已驳回",
        className: "bg-destructive-subtle text-destructive-subtle-foreground",
    },
}

/** 状态筛选选项与状态徽章同源（STATUS_BADGE 是唯一真相，加状态只改一处） */
const STATUS_FILTER: DataTableFilterConfig = {
    columnId: "status",
    title: "状态",
    options: Object.entries(STATUS_BADGE).map(([value, badge]) => ({
        value,
        label: badge.label,
    })),
}

/**
 * 从 column filters 取状态筛选值：DataTable 的 filter value 契约是 unknown，
 * 本列只可能由 STATUS_FILTER 选项（即 ShopReviewStatus 的值）组成，取最后一次选择；
 * 无合法值（含清空筛选）返回 undefined。
 */
function filterStatus(filters: ColumnFiltersState): ShopReviewStatus | undefined {
    const value = filters.find((f) => f.id === "status")?.value
    const candidate = Array.isArray(value) ? value.at(-1) : undefined
    return typeof candidate === "string" && candidate in ShopReviewStatus
        ? (candidate as ShopReviewStatus)
        : undefined
}

const columns: ColumnDef<ShopReviewItem>[] = [
    {
        accessorKey: "shopName",
        header: "店铺名称",
        cell: ({ row }) => <span className="font-medium">{row.original.shopName}</span>,
    },
    {
        accessorKey: "ownerPhone",
        header: "联系电话",
        cell: ({ row }) => <span className="tabular-nums">{row.original.ownerPhone}</span>,
    },
    {
        accessorKey: "status",
        header: "状态",
        cell: ({ row }) => {
            const badge = STATUS_BADGE[row.original.status]
            return <Badge className={badge.className}>{badge.label}</Badge>
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
                {formatTime(row.original.createdAt)}
            </span>
        ),
    },
    {
        accessorKey: "decidedAt",
        header: "处理时间",
        cell: ({ row }) =>
            row.original.decidedAt ? (
                <span className="tabular-nums text-muted-foreground">
                    {formatTime(row.original.decidedAt)}
                </span>
            ) : (
                <span className="text-muted-foreground">—</span>
            ),
    },
    {
        id: "actions",
        header: () => <span className="flex justify-end">操作</span>,
        enableHiding: false,
        cell: ({ row }) => <ReviewActions item={row.original} />,
    },
]

function ReviewPage() {
    const { status, page, size } = Route.useSearch()
    const navigate = Route.useNavigate()

    const { data, isPending, isError, refetch } = useQuery(
        reviewListOptions({ status, page, size }),
    )

    // 服务端模式：分页/筛选状态由 URL 接管，DataTable 内不自管
    const pagination = { pageIndex: page - 1, pageSize: size }
    const columnFilters: ColumnFiltersState = status ? [{ id: "status", value: [status] }] : []

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold">店铺审核</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    审核卖家开店申请，通过后店铺即可上架商品
                </p>
            </div>

            {isError ? (
                <div className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive-subtle px-4 py-3 text-sm text-destructive-subtle-foreground">
                    <span>审核列表加载失败，可能不是没有待审核的店铺。</span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void refetch()}
                    >
                        重新加载
                    </Button>
                </div>
            ) : null}

            <DataTable
                columns={columns}
                data={data?.records ?? []}
                rowCount={data?.total}
                isLoading={isPending}
                filters={[STATUS_FILTER]}
                pagination={pagination}
                onPaginationChange={(updater) => {
                    const next = typeof updater === "function" ? updater(pagination) : updater
                    void navigate({
                        search: { status, page: next.pageIndex + 1, size: next.pageSize },
                    })
                }}
                columnFilters={columnFilters}
                onColumnFiltersChange={(updater) => {
                    const next = typeof updater === "function" ? updater(columnFilters) : updater
                    // 后端 status 单值，多选时取最后一次选择
                    void navigate({ search: { status: filterStatus(next), page: 1, size } })
                }}
            />
        </div>
    )
}

function ReviewActions({ item }: { item: ShopReviewItem }) {
    const queryClient = useQueryClient()
    const [rejectOpen, setRejectOpen] = useState(false)
    const [approveOpen, setApproveOpen] = useState(false)
    const [reason, setReason] = useState("")

    const invalidate = () => queryClient.invalidateQueries({ queryKey: REVIEW_LIST_KEY })

    const approve = useMutation({
        mutationFn: () => adminApi.approve(item.id),
        onSuccess: () => {
            notify.success(`已通过「${item.shopName}」的开店申请`)
            setApproveOpen(false)
            void invalidate()
        },
        onError: (e) => notify.fromError(e, "审核操作失败"),
    })
    const reject = useMutation({
        mutationFn: () => adminApi.reject(item.id, reason),
        onSuccess: () => {
            notify.success(`已驳回「${item.shopName}」的开店申请`)
            setRejectOpen(false)
            setReason("")
            void invalidate()
        },
        onError: (e) => notify.fromError(e, "审核操作失败"),
    })

    const busy = approve.isPending || reject.isPending

    return (
        <div className="flex justify-end gap-2">
            <Button
                variant="outline"
                disabled={busy}
                onClick={() => setApproveOpen(true)}
            >
                {approve.isPending && <Spinner />}通过
            </Button>
            <ConfirmDialog
                open={approveOpen}
                onOpenChange={setApproveOpen}
                title={`通过「${item.shopName}」的开店申请`}
                description="通过后店铺即可上架商品，确认执行？"
                confirmText="确认通过"
                tone="default"
                pending={approve.isPending}
                onConfirm={() => approve.mutate()}
            />
            <Dialog
                open={rejectOpen}
                onOpenChange={setRejectOpen}
            >
                <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => setRejectOpen(true)}
                >
                    {reject.isPending && <Spinner />}驳回
                </Button>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>驳回「{item.shopName}」的开店申请</DialogTitle>
                        <DialogDescription>
                            驳回理由会通知申请人，请填写具体原因。
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="例如：营业执照信息与店铺主体不一致"
                        rows={3}
                    />
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setRejectOpen(false)}
                        >
                            取消
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={!reason.trim() || reject.isPending}
                            onClick={() => reject.mutate()}
                        >
                            {reject.isPending && <Spinner />}确认驳回
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

const formatTime = (iso: string) => {
    const d = new Date(iso)
    return isValid(d) ? format(d, "yyyy-MM-dd HH:mm") : iso
}
