import { createFileRoute } from "@tanstack/react-router"
import { ReviewPage } from "#/shop-review/list-page"
import { reviewSearchSchema } from "#/shop-review/queries"

export const Route = createFileRoute("/_app/")({
    validateSearch: reviewSearchSchema,
    component: ReviewRoute,
})

function ReviewRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    return (
        <ReviewPage
            search={search}
            navigate={navigate}
        />
    )
}
