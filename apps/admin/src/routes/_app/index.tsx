import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import type { ColumnDef, ColumnFiltersState } from "@tanstack/react-table"
import { format } from "date-fns"
import { useState } from "react"
import { z } from "zod"

import {
    Badge,
    Button,
    DataTable,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Textarea,
    type DataTableFilterConfig,
} from "@shop/ui-web"

import { adminApi, type ShopReviewItem } from "../../lib/api"

/** 店铺审核状态（与后端枚举对齐） */
type ShopReviewStatus = "PENDING" | "APPROVED" | "REJECTED"
const ShopReviewStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"])

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

const STATUS_FILTER: DataTableFilterConfig = {
    columnId: "status",
    title: "状态",
    options: [
        { label: "待审核", value: "PENDING" },
        { label: "已通过", value: "APPROVED" },
        { label: "已驳回", value: "REJECTED" },
    ],
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
            const badge = STATUS_BADGE[row.original.status as ShopReviewStatus]
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

    const { data, isPending } = useQuery({
        queryKey: ["admin", "reviews", status, page, size],
        queryFn: () => adminApi.listReviews({ status, page, size }),
    })

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
                    const values = next.find((f) => f.id === "status")?.value as
                        | string[]
                        | undefined
                    const s = values?.at(-1) as ShopReviewStatus | undefined
                    void navigate({ search: { status: s, page: 1, size } })
                }}
            />
        </div>
    )
}

function ReviewActions({ item }: { item: ShopReviewItem }) {
    const queryClient = useQueryClient()
    const [rejectOpen, setRejectOpen] = useState(false)
    const [reason, setReason] = useState("")

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] })

    const approve = useMutation({
        mutationFn: () => adminApi.approve(item.id),
        onSuccess: invalidate,
    })
    const reject = useMutation({
        mutationFn: () => adminApi.reject(item.id, reason),
        onSuccess: () => {
            setRejectOpen(false)
            setReason("")
            void invalidate()
        },
    })

    return (
        <div className="flex justify-end gap-2">
            <Button
                variant="outline"
                disabled={approve.isPending || reject.isPending}
                onClick={() => approve.mutate()}
            >
                通过
            </Button>
            <Dialog
                open={rejectOpen}
                onOpenChange={setRejectOpen}
            >
                <Button
                    variant="outline"
                    className="text-destructive hover:bg-destructive-subtle"
                    disabled={approve.isPending || reject.isPending}
                    onClick={() => setRejectOpen(true)}
                >
                    驳回
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
                            确认驳回
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

const formatTime = (iso: string) => format(new Date(iso), "yyyy-MM-dd HH:mm")
