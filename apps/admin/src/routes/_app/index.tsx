import { message } from "#/locales/message"
import { AdminReviewsApi } from "@shop/api/sdk"
import type { ShopReviewItem } from "@shop/api/sdk"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { localizeStatusOptions } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { useReviewColumns } from "#/shop-review/columns"
import { STATUS_OPTIONS } from "#/shop-review/constants"
import { reviewKeys, reviewListOptions, reviewSearchSchema } from "#/shop-review/queries"
import { PagedListShell } from "#/shared/ui/paged-list-shell"
import { StatusFilter } from "#/shared/ui/status-filter"

export const Route = createFileRoute("/_app/")({
    validateSearch: reviewSearchSchema,
    component: ReviewRoute,
})

/**
 * 店铺审核队列。页面只管两件事：取数 + 把 URL 里的分页/筛选状态递给表格。
 * 列定义见 `#/shop-review/columns`，一行的通过/驳回见 `#/shop-review/review-actions`，
 * 状态枚举与徽标文案见 `#/shop-review/constants`（筛选下拉和状态列共用一份）。
 */
function ReviewRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    const queryClient = useQueryClient()
    const t = useT()
    const query = useQuery(reviewListOptions(search))

    // 店主电话明文逐条索取（ACC-79）：取到写回这一行，故意不失效列表——失效会立刻把刚拿到的明文冲掉，
    // 下次重新拉取自然又回掩码，明文不长期驻留
    const revealPhone = useMutation({
        mutationFn: async (item: ShopReviewItem) => {
            const res = await AdminReviewsApi.revealOwnerPhone({ path: { id: item.id } })
            return res.phone
        },
        meta: { error: message("shopReview.phone.failed") },
        onSuccess: (phone, item) =>
            queryClient.setQueryData<NonNullable<typeof query.data>>(
                reviewKeys.list(search),
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

    return (
        <PagedListShell
            title={t("shopReview.page.title")}
            description={t("shopReview.page.description")}
            search={search}
            navigate={navigate}
            query={query}
            columns={columns}
            emptyContent={t("shopReview.page.empty")}
            filters={
                <StatusFilter
                    value={search.status}
                    options={localizeStatusOptions(STATUS_OPTIONS, t)}
                    onChange={(status) => void navigate({ search: { ...search, status, page: 1 } })}
                />
            }
        />
    )
}
