import { createFileRoute } from "@tanstack/react-router"
import { paginationSearchSchema } from "@shop/app-kit"
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
import { ReviewTable, shopReviewsOptions } from "#/review"
import { useShop } from "#/shop"

export const Route = createFileRoute("/_app/trade/review")({
    validateSearch: paginationSearchSchema,
    component: ReviewPage,
})

/**
 * 评价管理：看买家对本店订单说了什么，回复一次。
 *
 * 没有任何筛选维度（状态/星级）——一期列表短，筛选器是为了「几百条以后」才有的东西，
 * 提前加只会在每次改口径时多一处要维护的联动。
 */
function ReviewPage() {
    const search = Route.useSearch()
    const shop = useShop()
    const navigate = Route.useNavigate()
    const { data, isLoading } = useQuery(shopReviewsOptions(shop.id, search))

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
                    <EmptyTitle>还没有买家评价</EmptyTitle>
                    <EmptyDescription>
                        买家完成订单后可以在订单页评价，评价会出现在这里
                    </EmptyDescription>
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
