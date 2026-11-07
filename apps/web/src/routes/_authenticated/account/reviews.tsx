import { useState } from "react"

import { createFileRoute } from "@tanstack/react-router"
import type { SearchSchemaInput } from "@tanstack/react-router"
import { z } from "zod"
import { translateWeb } from "#/locales"
import { useT } from "#/locales/use-t"
import { Button, Skeleton, Tabs, TabsList, TabsTrigger } from "@shop/ui-web"
import { useQuery } from "@tanstack/react-query"

import {
    AppendReviewDialog,
    ReviewCard,
    SubmitReviewDialog,
    myReviewsOptions,
    pendingReviewsOptions,
    useAppendReview,
    useSubmitReview,
} from "#/domains/review"
import type { ReviewItem } from "#/domains/review"

const REVIEW_TABS = ["pending", "mine"] as const

// URL 页签白名单 + 兜底：地址栏乱填不会拿到一份"不知怎么筛出来的"列表
const reviewsSearchSchema = z.object({
    tab: z.enum(REVIEW_TABS).catch("pending"),
    cursor: z.string().optional(),
})

type ReviewsSearchInput = SearchSchemaInput & { tab?: string; cursor?: string }

export const Route = createFileRoute("/_authenticated/account/reviews")({
    validateSearch: (search: ReviewsSearchInput) => reviewsSearchSchema.parse(search),
    component: ReviewsPage,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.reviews", match.context.locale) }],
    }),
})

function ReviewsPage() {
    const t = useT()
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    const tab = search.tab

    const pending = useQuery(pendingReviewsOptions({ cursor: search.cursor ?? "" }))
    const mine = useQuery(myReviewsOptions({ cursor: search.cursor ?? "" }))
    const isPending = tab === "pending"
    const page = isPending ? pending.data : mine.data
    const loading = isPending ? pending.isLoading : mine.isLoading

    const [reviewTarget, setReviewTarget] = useState<ReviewItem | undefined>()
    const [appendTarget, setAppendTarget] = useState<ReviewItem | undefined>()
    const submit = useSubmitReview()
    const append = useAppendReview()

    function switchTab(next: string) {
        const value = REVIEW_TABS.find((candidate) => candidate === next)
        if (value) void navigate({ search: { tab: value, cursor: "" } })
    }

    const nextCursor = page?.nextCursor

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">{t("review.page.title")}</h2>

            <Tabs value={tab}>
                <TabsList
                    variant="line"
                    className="min-h-10 w-full justify-start overflow-x-auto"
                >
                    {REVIEW_TABS.map((value) => (
                        <TabsTrigger
                            key={value}
                            value={value}
                            size="lg"
                            onClick={() => switchTab(value)}
                        >
                            {value === "pending" ? t("review.tab.pending") : t("review.tab.mine")}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            {loading ? (
                <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        // oxlint-disable-next-line react/no-array-index-key, react-doctor/no-array-index-key
                        <Skeleton
                            key={index}
                            className="h-24 w-full rounded-lg"
                        />
                    ))}
                </div>
            ) : (page?.items.length ?? 0) === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                    {isPending ? t("review.empty.pending") : t("review.empty.mine")}
                </p>
            ) : (
                <div className="space-y-3">
                    {(page?.items ?? []).map((item) => (
                        <ReviewCard
                            key={item.id}
                            item={item}
                            onReview={setReviewTarget}
                            onAppend={setAppendTarget}
                        />
                    ))}
                    {nextCursor && (
                        <div className="flex justify-center">
                            <Button
                                variant="outline"
                                onClick={() =>
                                    void navigate({ search: { tab, cursor: nextCursor } })
                                }
                            >
                                {t("common.loadMore")}
                            </Button>
                        </div>
                    )}
                </div>
            )}

            <SubmitReviewDialog
                item={reviewTarget}
                onOpenChange={(open) => {
                    if (!open) setReviewTarget(undefined)
                }}
                onSubmit={async (input) => {
                    await submit.mutateAsync(input)
                }}
                pending={submit.isPending}
            />
            <AppendReviewDialog
                item={appendTarget}
                onOpenChange={(open) => {
                    if (!open) setAppendTarget(undefined)
                }}
                onAppend={async (input) => {
                    await append.mutateAsync(input)
                }}
                pending={append.isPending}
            />
        </div>
    )
}
