import { createFileRoute } from "@tanstack/react-router"
import { paginationSearchSchema, useOutOfRangePageGuard } from "@shop/app-kit/data"
import { useQuery } from "@tanstack/react-query"
import {
    DataTableSkeleton,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@shop/ui-web"
import { MessageSquareOff } from "lucide-react"
import { ReviewTable, shopReviewsOptions } from "#/domains/review"
import { useT } from "#/locales/use-t"
import { useShop } from "#/domains/shop"

export const Route = createFileRoute("/_authenticated/trade/review")({
    validateSearch: paginationSearchSchema,
    component: ReviewPage,
})

function ReviewPage() {
    const search = Route.useSearch()
    const shop = useShop()
    const navigate = Route.useNavigate()
    const t = useT("review")
    const { data, isLoading } = useQuery(shopReviewsOptions(shop.id, search))

    useOutOfRangePageGuard({
        page: search.page,
        total: data?.total,
        size: search.size,
        onFix: (page) => void navigate({ search: { page, size: search.size }, replace: true }),
    })

    if (isLoading) {
        return <DataTableSkeleton columns={5} />
    }
    if (!data || data.records.length === 0) {
        return (
            <Empty className="py-16">
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <MessageSquareOff />
                    </EmptyMedia>
                    <EmptyTitle>{t("review.page.empty.title")}</EmptyTitle>
                    <EmptyDescription>{t("review.page.empty.description")}</EmptyDescription>
                </EmptyHeader>
            </Empty>
        )
    }
    return (
        <ReviewTable
            rows={data.records}
            total={data.total}
            page={search.page}
            pageSize={search.size}
            onPageChange={(page) => void navigate({ search: { page, size: search.size } })}
        />
    )
}
