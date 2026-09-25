import { AdminReviewsApi } from "@shop/api/sdk"
import type { ShopReviewItem } from "@shop/api/sdk"
import { createPaginationSearchSchema } from "@shop/app-kit"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
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
    useDataTable,
} from "@shop/ui-web"
import { reviewKeys, reviewListOptions } from "#/shared/lib/queries"
import { ShopReviewStatusSchema, STATUS_OPTIONS } from "#/shop-review/constants"
import { useReviewColumns } from "#/shop-review/columns"

export const Route = createFileRoute("/_app/")({
    validateSearch: createPaginationSearchSchema(20).extend({
        status: ShopReviewStatusSchema.optional(),
    }),
    component: ReviewPage,
})

const EMPTY_REVIEWS: ShopReviewItem[] = []

/**
 * 店铺审核队列。页面只管两件事：取数 + 把 URL 里的分页/筛选状态递给表格。
 * 列定义见 `#/shop-review/columns`，一行的通过/驳回见 `#/shop-review/review-actions`，
 * 状态枚举与徽标文案见 `#/shop-review/constants`（筛选下拉和状态列共用一份）。
 */
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
                        // 「全部状态」是下拉的哨兵，不入库：URL 里回到缺省，请求参数才不会带上 status=all
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
                        {STATUS_OPTIONS.map((option) => (
                            <SelectItem
                                key={option.value}
                                value={option.value}
                            >
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </DataTableToolbar>
            {isPending ? (
                <DataTableSkeleton columns={columns.length} />
            ) : (
                <DataTable
                    table={table}
                    emptyContent="暂无符合条件的审核申请"
                    footer={<DataTablePagination table={table} />}
                />
            )}
        </div>
    )
}
