import { message } from "#/locales/message"
import { AdminReviewsApi } from "@shop/api/sdk"
import type { ShopReviewItem } from "@shop/api/sdk"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { localizeStatusOptions } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { useReviewColumns } from "#/domains/shop-review/columns"
import { STATUS_OPTIONS } from "#/domains/shop-review/constants"
import { reviewKeys, reviewListOptions } from "#/domains/shop-review/queries"
import { reviewSearchSchema } from "#/domains/shop-review/search"
import { PagedListShell } from "#/shared/ui/paged-list-shell"
import { StatusFilter } from "#/shared/ui/status-filter"

export const Route = createFileRoute("/_app/")({
    validateSearch: reviewSearchSchema,
    component: ReviewRoute,
})

function ReviewRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    const queryClient = useQueryClient()
    const t = useT()
    const query = useQuery(reviewListOptions(search))

    // 故意不失效列表：失效会立刻把刚取到的明文冲回掩码，只 setQueryData 写回这一行
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
