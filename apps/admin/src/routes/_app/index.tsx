import { useMemo, useState } from "react"
import { AdminReviewsApi, ShopReviewStatus } from "@shop/api/sdk"
import type { ShopReviewItem } from "@shop/api/sdk"
import { formatDateTime } from "@shop/app-kit"
import { z } from "zod"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
    useAppForm,
    useDataTable,
    type DataTableFeatures,
} from "@shop/ui-web"
import { reviewKeys, reviewListOptions } from "#/shared/lib/queries"
import type { ColumnDef } from "@tanstack/react-table"

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

/**
 * 列定义。联系电话那一行要能触发「取明文」，所以列跟着页面状态走（不是模块级常量）：
 * 后端出参恒为掩码，点「查看」逐条索取，取到的号码写回列表缓存的这一行（ACC-79）。
 */
function useReviewColumns({
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
                    <OwnerPhoneCell
                        phone={row.original.ownerPhone}
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
            {
                id: "actions",
                header: () => <span className="flex justify-end">操作</span>,
                enableHiding: false,
                cell: ({ row }) => <ReviewActions item={row.original} />,
            },
        ],
        [onRevealPhone, revealingId],
    )
}

/**
 * 联系电话：后端出参是掩码（前 3 后 4），点「查看」逐条取明文——这次取用会在后端留痕（ACC-79）。
 * 取到的明文由页面写回列表缓存，于是掩码判断只看这一个字符串里还有没有 `****`（掩码的唯一形状）。
 */
function OwnerPhoneCell({
    phone,
    revealing,
    onReveal,
}: {
    phone: string
    revealing: boolean
    onReveal: () => void
}) {
    return (
        <div className="flex items-center gap-1.5">
            <span className="tabular-nums">{phone}</span>
            {phone.includes("****") && (
                <Button
                    variant="link"
                    size="xs"
                    disabled={revealing}
                    onClick={onReveal}
                >
                    {revealing && <Spinner />}
                    查看
                </Button>
            )}
        </div>
    )
}

function ReviewPage() {
    const { status, page, size } = Route.useSearch()
    const navigate = Route.useNavigate()
    const queryClient = useQueryClient()

    const { data, isPending } = useQuery(reviewListOptions({ status, page, size }))

    // 店主电话明文逐条索取（ACC-79）：取到写回这一行，故意不失效列表——失效会立刻把刚拿到的明文冲掉，
    // 下次重新拉取自然又回掩码，明文不长期驻留
    const revealPhone = useMutation({
        mutationFn: async (item: ShopReviewItem) => {
            const res = await AdminReviewsApi.revealOwnerPhone({ path: { id: item.id } })
            return res.phone
        },
        meta: { error: "查看店主电话失败" },
        onSuccess: (phone, item) =>
            queryClient.setQueryData<NonNullable<typeof data>>(
                reviewKeys.list({ status, page, size }),
                (prev) =>
                    prev
                        ? {
                              ...prev,
                              records: prev.records.map((r) =>
                                  r.id === item.id ? { ...r, ownerPhone: phone } : r,
                              ),
                          }
                        : prev,
            ),
    })
    const columns = useReviewColumns({
        onRevealPhone: revealPhone.mutate,
        revealingId: revealPhone.isPending ? revealPhone.variables.id : undefined,
    })

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

    const approve = useMutation({
        mutationFn: () => AdminReviewsApi.approveShopReview({ path: { id: item.id } }),
        meta: {
            success: `已通过「${item.shopName}」的开店申请`,
            error: "审核操作失败",
            invalidates: [reviewKeys.all],
        },
    })
    const reject = useMutation({
        mutationFn: (reason: string) =>
            AdminReviewsApi.rejectShopReview({ path: { id: item.id }, body: { reason } }),
        meta: {
            success: `已驳回「${item.shopName}」的开店申请`,
            error: "审核操作失败",
            invalidates: [reviewKeys.all],
        },
        onSuccess: () => setRejectOpen(false),
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
                    {/* 表单体挂在 DialogContent 里：BaseUI 关闭即卸载，重开即空白 */}
                    <RejectForm
                        pending={reject.isPending}
                        onCancel={() => setRejectOpen(false)}
                        onSubmit={(reason) => reject.mutate(reason)}
                    />
                </DialogContent>
            </Dialog>
        </div>
    )
}

const RejectSchema = z.object({ reason: z.string().trim().min(1, "请填写驳回理由") })

function RejectForm({
    pending,
    onCancel,
    onSubmit,
}: {
    pending: boolean
    onCancel: () => void
    onSubmit: (reason: string) => void
}) {
    const form = useAppForm({
        defaultValues: { reason: "" },
        validators: { onSubmit: RejectSchema },
        onSubmit: ({ value }) => onSubmit(value.reason.trim()),
    })
    return (
        <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
                e.preventDefault()
                void form.handleSubmit()
            }}
        >
            <form.AppField name="reason">
                {(field) => (
                    <field.TextareaField
                        aria-label="驳回理由"
                        placeholder="例如：营业执照信息与店铺主体不一致"
                        rows={3}
                    />
                )}
            </form.AppField>
            <DialogFooter>
                <Button
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                >
                    取消
                </Button>
                <Button
                    type="submit"
                    variant="destructive"
                    disabled={pending}
                >
                    {pending && <Spinner />}确认驳回
                </Button>
            </DialogFooter>
        </form>
    )
}
