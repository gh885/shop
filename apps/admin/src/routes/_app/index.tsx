import { useState } from "react"
import { ShopReviewStatus } from "@shop/api/sdk"
import { z } from "zod"

import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
    Badge,
    Button,
    confirm,
    DataTable,
    DataTableToolbar,
    DataTablePagination,
    DataTableSkeleton,
    DataTableViewOptions,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Spinner,
    Textarea,
    useDataTable,
    type DataTableFeatures,
} from "@shop/ui-web"
import { type ShopReviewItem, reviewListOptions, adminApi } from "#/shared/lib/api"
import { reviewKeys } from "#/shared/lib/queries"
import type { ColumnDef } from "@tanstack/react-table"
import { isValid, format } from "date-fns"

/** 店铺审核状态（与后端枚举对齐） */
const ShopReviewStatusSchema = z.enum(ShopReviewStatus)

export const Route = createFileRoute("/_app/")({
    validateSearch: z.object({
        status: ShopReviewStatusSchema.optional(),
        // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
        page: z.coerce.number().int().min(1).catch(1),
        // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
        size: z.coerce.number().int().min(1).catch(20),
    }),
    component: ReviewPage,
})

const STATUS_BADGE: Record<
    ShopReviewStatus,
    { label: string; variant: "warning" | "success" | "destructive-subtle" }
> = {
    PENDING: {
        label: "待审核",
        variant: "warning",
    },
    APPROVED: {
        label: "已通过",
        variant: "success",
    },
    REJECTED: {
        label: "已驳回",
        variant: "destructive-subtle",
    },
}

const EMPTY_REVIEWS: ShopReviewItem[] = []

const columns: ColumnDef<DataTableFeatures, ShopReviewItem>[] = [
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

    const { data, isPending } = useQuery(reviewListOptions({ status, page, size }))

    // 服务端模式：分页/筛选状态由 URL 接管，DataTable 内不自管
    const pagination = { pageIndex: page - 1, pageSize: size }

    const { table } = useDataTable({
        columns,
        data: data?.records ?? EMPTY_REVIEWS,
        getRowId: (row) => row.id,
        enableSorting: false,
        rowCount: data?.total,
        manualPagination: true,
        manualFiltering: true,
        manualSorting: true,
        state: { pagination },
        onPaginationChange: (updater) => {
            const next = typeof updater === "function" ? updater(pagination) : updater
            void navigate({
                search: { status, page: next.pageIndex + 1, size: next.pageSize },
            })
        },
    })

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold">店铺审核</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    审核卖家开店申请，通过后店铺即可上架商品
                </p>
            </div>

            <DataTableToolbar
                table={table}
                actions={<DataTableViewOptions table={table} />}
            >
                <Select
                    value={status ?? "all"}
                    onValueChange={(value) => {
                        const parsed = ShopReviewStatusSchema.safeParse(value)
                        void navigate({
                            search: {
                                status: parsed.success ? parsed.data : undefined,
                                page: 1,
                                size,
                            },
                        })
                    }}
                >
                    <SelectTrigger aria-label="审核状态">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部状态</SelectItem>
                        {Object.entries(STATUS_BADGE).map(([value, badge]) => (
                            <SelectItem
                                key={value}
                                value={value}
                            >
                                {badge.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </DataTableToolbar>
            {isPending ? (
                <DataTableSkeleton columns={columns.length} />
            ) : (
                <>
                    <DataTable
                        table={table}
                        emptyContent="暂无符合条件的审核申请"
                    />
                    <DataTablePagination table={table} />
                </>
            )}
        </div>
    )
}

function ReviewActions({ item }: { item: ShopReviewItem }) {
    const [rejectOpen, setRejectOpen] = useState(false)
    const [reason, setReason] = useState("")

    const approve = useMutation({
        mutationFn: () => adminApi.approve(item.id),
        meta: {
            success: `已通过「${item.shopName}」的开店申请`,
            error: "审核操作失败",
            invalidates: [reviewKeys.all],
        },
    })
    const reject = useMutation({
        mutationFn: () => adminApi.reject(item.id, reason),
        meta: {
            success: `已驳回「${item.shopName}」的开店申请`,
            error: "审核操作失败",
            invalidates: [reviewKeys.all],
        },
        onSuccess: () => {
            setRejectOpen(false)
            setReason("")
        },
    })

    const busy = approve.isPending || reject.isPending

    /** 通过二次确认：确认即审核通过，失败保持打开（错误提示走全局 mutation 反馈） */
    function confirmApprove() {
        void confirm({
            title: `通过「${item.shopName}」的开店申请`,
            description: "通过后店铺即可上架商品，确认执行？",
            confirmText: "确认通过",
            action: () => approve.mutateAsync(),
        })
    }

    return (
        <div className="flex justify-end gap-2">
            <Button
                variant="outline"
                disabled={busy}
                onClick={confirmApprove}
            >
                {approve.isPending && <Spinner />}通过
            </Button>
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
